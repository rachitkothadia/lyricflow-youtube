const registryKey = Symbol.for("lyricflow.keyboard");
type Registry = { roots: WeakSet<ShadowRoot> };

/** Installed before page scripts; only registered panel roots consume keyboard events. */
export function installKeyboardGuard(): Registry {
  const existing = Reflect.get(window, registryKey) as Registry | undefined;
  if (existing) return existing;
  const registry: Registry = { roots: new WeakSet() };
  Reflect.set(window, registryKey, registry);
  const guard = (event: KeyboardEvent) => {
    const origin = event.composedPath()[0];
    if (!(origin instanceof Node)) return;
    const root = origin.getRootNode();
    if (!(root instanceof ShadowRoot) || !registry.roots.has(root)) return;
    event.stopImmediatePropagation();
    // Keep native editing/default actions on the trusted event. Deliver panel handlers
    // a local copy that cannot cross the Shadow DOM boundary into player handlers.
    const local = new KeyboardEvent(event.type, {
      key: event.key,
      code: event.code,
      location: event.location,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      repeat: event.repeat,
      isComposing: event.isComposing,
      bubbles: event.bubbles,
      cancelable: event.cancelable,
      composed: false,
    });
    if (!origin.dispatchEvent(local)) event.preventDefault();
  };
  for (const type of ["keydown", "keypress", "keyup"])
    window.addEventListener(type, guard as EventListener, true);
  return registry;
}

export function protectPanelKeyboard(root: ShadowRoot): () => void {
  const registry = installKeyboardGuard();
  registry.roots.add(root);
  return () => registry.roots.delete(root);
}
