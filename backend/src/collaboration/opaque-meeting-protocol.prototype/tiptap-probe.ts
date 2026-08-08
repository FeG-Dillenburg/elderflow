/** PROTOTYPE — disposable Tiptap/Yjs mounting compatibility probe. */
import * as Y from 'yjs';

export interface TiptapProbeResult {
  passed: boolean;
  detail: string;
}

export const runTiptapProbe = async (): Promise<TiptapProbeResult> => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { JSDOM } = require('jsdom') as { JSDOM: new (html: string) => { window: Window & typeof globalThis } };
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const prototypeGlobal = globalThis as typeof globalThis & {
    window: Window & typeof globalThis;
    document: Document;
    navigator: Navigator;
  };
  prototypeGlobal.window = dom.window;
  prototypeGlobal.document = dom.window.document;
  Object.defineProperty(prototypeGlobal, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  });

  const [{ Editor }, { default: StarterKit }, { default: Collaboration }] = await Promise.all([
    import('@tiptap/core'),
    import('@tiptap/starter-kit'),
    import('@tiptap/extension-collaboration'),
  ]);
  const document = new Y.Doc();
  const fields = [
    'meeting/general-notes',
    'meeting/opening-input',
    'appearance/appearance-a/preparation-context',
    'appearance/appearance-a/minutes',
    'appearance/appearance-person/person-note',
  ];
  const editors = fields.map((field) => {
    const element = dom.window.document.createElement('div');
    dom.window.document.body.append(element);
    return new Editor({
      element,
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document, field }),
      ],
    });
  });

  fields.forEach((field, index) => {
    editors[index].commands.insertContent(`<p>${field}</p>`);
  });
  const independentlyBound = fields.every((field, index) =>
    editors[index].getText().includes(field) &&
    fields.every((otherField, otherIndex) => otherIndex === index || !editors[otherIndex].getText().includes(field)));

  const encoded = Y.encodeStateAsUpdateV2(document);
  const replica = new Y.Doc();
  Y.applyUpdateV2(replica, encoded);
  const survivedRoundTrip = fields.every((field) => replica.getXmlFragment(field).toString().includes(field));
  const heapBeforeDestroy = process.memoryUsage().heapUsed;
  editors.forEach((editor) => editor.destroy());
  document.destroy();
  replica.destroy();

  return {
    passed: independentlyBound && survivedRoundTrip,
    detail: `${editors.length} independently mounted Tiptap editors; encrypted-snapshot input ${encoded.byteLength} bytes; heap at teardown ${(heapBeforeDestroy / 1024 / 1024).toFixed(1)}MiB`,
  };
};
