const canUseDOM = !!(
  typeof window !== 'undefined' &&
  window.document &&
  window.document.createElement
);

let styleElement: HTMLStyleElement | undefined;

interface HotData {
  styleElement: typeof styleElement;
}

interface NodeModule {
  hot: {
    data: HotData;
    addDisposeHandler: (handler: (data: HotData) => void) => void;
  };
}

declare var module: NodeModule;

if (
  typeof module !== 'undefined' &&
  module.hot &&
  typeof module.hot.addDisposeHandler === 'function'
) {
  // gross
  const { hot } = module;
  if (hot.data != null) {
    styleElement = hot.data.styleElement;
  }

  hot.addDisposeHandler(data => {
    data.styleElement = styleElement;
  });
}

if (canUseDOM && !styleElement) {
  styleElement = document.createElement('style');
  styleElement.type = 'text/css';
  styleElement.appendChild(document.createTextNode('/* jsxstyle */'));
  document.head!.appendChild(styleElement);
}

export function addStyleToHead(rule: string): void {
  if (styleElement && styleElement.sheet) {
    const sheet = styleElement.sheet as CSSStyleSheet;
    try {
      sheet.insertRule(rule, sheet.cssRules.length);
    } catch (insertError) {
      // insertRule will fail for rules with pseudoelements the browser doesn't support.
      // see: https://github.com/jsxstyle/jsxstyle/issues/75
      if (process.env.NODE_ENV !== 'production') {
        console.error(
          '[jsxstyle] Could not insert rule at position ' +
            sheet.cssRules.length +
            ': `' +
            rule +
            '`'
        );
      }
    }
  }
}
