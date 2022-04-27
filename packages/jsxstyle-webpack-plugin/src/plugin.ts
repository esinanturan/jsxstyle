import fs = require('fs');
// @ts-expect-error
import NodeWatchFileSystem = require('webpack/lib/node/NodeWatchFileSystem');
import { Volume } from 'memfs';
import { createClassNameGetter } from 'jsxstyle/utils';

import type { CacheObject, PluginContext } from './types';
import { wrapFileSystem } from './utils/wrapFileSystem';
import { ModuleCache } from './utils/ModuleCache';
import type { UserConfigurableOptions } from './utils/ast/extractStyles';

type Compilation = import('webpack').Compilation;
type Compiler = import('webpack').Compiler;
type WebpackPluginInstance = import('webpack').WebpackPluginInstance;

const pluginName = 'JsxstyleWebpackPlugin';
const childCompilerName = `${pluginName} compiled modules`;

interface JsxstyleWebpackPluginOptions extends UserConfigurableOptions {
  /** An array of absolute paths to modules that should be compiled by webpack */
  staticModules?: string[];

  /** If set to `'hash'`, use content-based hashes to generate classNames */
  classNameFormat?: 'hash';

  /**
   * An absolute path to a file that will be used to store jsxstyle class name cache information between builds.
   *
   * If `cacheFile` is set, the file will be created if it does not exist and will be overwritten every time `jsxstyle-webpack-plugin` runs.
   */
  cacheFile?: string;
}

class JsxstyleWebpackPlugin implements WebpackPluginInstance {
  constructor({
    cacheFile,
    classNameFormat,
    staticModules,
    ...loaderOptions
  }: JsxstyleWebpackPluginOptions = {}) {
    const cacheObject: CacheObject = {};

    const getClassNameForKey = createClassNameGetter(
      cacheObject,
      classNameFormat
    );

    if (typeof cacheFile === 'string') {
      try {
        const cacheFileContents = fs.readFileSync(cacheFile, {
          encoding: 'utf8',
          flag: 'r',
        });

        // create mapping of unique CSS strings to class names
        const lines = new Set<string>(cacheFileContents.trim().split('\n'));
        lines.forEach((line) => {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            // add each line of CSS to the cache
            getClassNameForKey(trimmedLine);
          }
        });

        this.donePlugin = (): void => {
          // write contents of cache object as a newline-separated list of CSS strings
          const cacheString =
            Object.keys(cacheObject).filter(Boolean).join('\n') + '\n';
          fs.writeFileSync(cacheFile, cacheString, 'utf8');
        };
      } catch (err) {
        if (err.code === 'EISDIR') {
          throw new Error('cacheFile is a directory');
        }
      }
    }

    if (Array.isArray(staticModules)) {
      this.entrypointCache = new ModuleCache(staticModules);
    }

    const getModules =
      this.entrypointCache?.getModules || (() => Promise.resolve({}));

    this.memoryFS = new Volume();

    // context object that gets passed to each loader.
    // available in each loader as this[Symbol.for('jsxstyle-webpack-plugin')]
    this.ctx = {
      getClassNameForKey,
      getModules,
      defaultLoaderOptions: loaderOptions,
      memoryFS: this.memoryFS,
    };
  }

  public static loader = require.resolve('./loader');

  private ctx: PluginContext;
  private memoryFS = new Volume();
  private entrypointCache?: ModuleCache;

  private nmlPlugin = (loaderContext: any): void => {
    loaderContext[Symbol.for('jsxstyle-webpack-plugin')] = this.ctx;
  };

  /** conditionally set based on whether or not we have a `cacheFile` */
  private donePlugin: (() => void) | null = null;

  private makePlugin = (compiler: Compiler, moduleCache: ModuleCache) => (
    compilation: Compilation
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const resultObject: Record<string, string> = {};

      const childCompiler = compilation.createChildCompiler(
        childCompilerName,
        {
          filename: '[name]',
          library: {
            type: 'commonjs2',
          },
          scriptType: 'text/javascript',
          iife: true,
        },
        [
          new compiler.webpack.node.NodeTargetPlugin(),
          new compiler.webpack.node.NodeTemplatePlugin(),
          new compiler.webpack.LoaderTargetPlugin('node'),
          new compiler.webpack.library.EnableLibraryPlugin('commonjs2'),
        ]
      );

      childCompiler.context = compiler.context;
      childCompiler.options.output.library = {
        type: 'commonjs2',
        umdNamedDefine: false,
      };

      Object.entries(moduleCache.entrypoints).forEach(
        ([modulePath, metadata]) => {
          new compiler.webpack.EntryPlugin(
            compiler.context,
            modulePath,
            metadata.key
          ).apply(childCompiler);
        }
      );

      // delete all emitted chunks
      childCompiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
        compilation.hooks.processAssets.tap(
          {
            name: pluginName,
            stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
          },
          (assets) => {
            Object.keys(assets).forEach((key) => {
              resultObject[key] = assets[key].source().toString();
              compilation.deleteAsset(key);
            });
          }
        );
      });

      childCompiler.hooks.normalModuleFactory.tap(
        pluginName,
        (normalModuleFactory) => {
          normalModuleFactory.hooks.afterResolve.tap(
            pluginName,
            (resolveData) => {
              resolveData.createData.loaders = resolveData.createData.loaders?.filter(
                (loaderObj) => loaderObj.loader !== JsxstyleWebpackPlugin.loader
              );
            }
          );
        }
      );

      childCompiler.hooks.beforeCompile.tap(pluginName, () => {
        moduleCache.reset();
      });

      childCompiler.runAsChild((err) => {
        if (err) {
          compilation.errors.push(err as any);
          moduleCache.reject(err);
          reject(err);
        } else {
          moduleCache.setModules(resultObject);
          resolve();
        }
      });
    });
  };

  public apply(compiler: Compiler): void {
    const environmentPlugin = (): void => {
      const wrappedFS = wrapFileSystem(compiler.inputFileSystem, this.memoryFS);
      compiler.inputFileSystem = wrappedFS;
      compiler.watchFileSystem = new NodeWatchFileSystem(wrappedFS);
    };

    compiler.hooks.environment.tap(pluginName, environmentPlugin);
    compiler.hooks.compilation.tap(pluginName, (compilation) => {
      compiler.webpack.NormalModule.getCompilationHooks(compilation).loader.tap(
        pluginName,
        this.nmlPlugin
      );
    });

    if (this.donePlugin) {
      compiler.hooks.done.tap(pluginName, this.donePlugin);
    }

    if (this.entrypointCache) {
      compiler.hooks.make.tapPromise(
        pluginName,
        this.makePlugin(compiler, this.entrypointCache)
      );
    }
  }
}

export = JsxstyleWebpackPlugin;
