/* ============================================================
   tradingview.jsx — TradingView widget wrapper.
   Drops a TV embed script into a container, re-mounts on theme
   or config change. Themes: app's data-theme is mapped to TV's
   light/dark via useTVTheme.
   Exposes globals: TVWidget, useTVTheme.
   ============================================================ */

const { useEffect: useEffectTV, useRef: useRefTV, useState: useStateTV } = React;

const TV_EMBED_BASE = 'https://s3.tradingview.com/external-embedding/embed-widget-';

/* App theme → TV's light/dark binary. */
function mapTVTheme(appTheme) {
  return appTheme === 'dark' || appTheme === 'aurora' ? 'dark' : 'light';
}

function useTVTheme() {
  const [theme, setTheme] = useStateTV(() =>
    mapTVTheme(document.body.dataset.theme || 'fintech'),
  );

  useEffectTV(() => {
    const observer = new MutationObserver(() => {
      setTheme(mapTVTheme(document.body.dataset.theme));
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

/* clear all children from a node without using innerHTML. */
function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/* TVWidget — embeds a TradingView widget by name + config.
   Re-mounts whenever widget name or stringified config changes. */
function TVWidget({ widget, config, height = 'auto', className }) {
  const ref = useRefTV(null);
  // Embed baru dimuat saat mendekati layar: widget di bawah lipatan (chart IHSG di landing)
  // tidak berebut bandwidth dan CPU dengan konten utama di HP.
  const [near, setNear] = useStateTV(false);

  useEffectTV(() => {
    const el = ref.current;
    if (!el || near) return undefined;
    if (!('IntersectionObserver' in window)) { setNear(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setNear(true); }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  useEffectTV(() => {
    const container = ref.current;
    if (!container || !near) return undefined;

    clearNode(container);

    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    container.appendChild(inner);

    const script = document.createElement('script');
    script.src = TV_EMBED_BASE + widget + '.js';
    script.async = true;
    script.type = 'text/javascript';
    script.text = JSON.stringify(config);
    container.appendChild(script);

    return () => {
      if (container) clearNode(container);
    };
  }, [near, widget, JSON.stringify(config)]);

  return (
    <div
      ref={ref}
      className={'tradingview-widget-container ' + (className || '')}
      style={{ height, width: '100%' }}
    />
  );
}

Object.assign(window, { TVWidget, useTVTheme });
