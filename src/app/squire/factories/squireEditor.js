import { DEFAULT_SQUIRE_VALUE } from '../../constants';

const { IFRAME_CLASS } = DEFAULT_SQUIRE_VALUE;

/* @ngInject */
function squireEditor(dispatchers, editorModel, sanitize) {
    const CACHE = {};

    const { dispatcher } = dispatchers(['squire.editor']);

    /**
     * Override the default sanitizeToDOMFragment function in Squire.
     * This allows proton-[attr] attributes to exist in the html, to allow for squire to show remote content
     * and embedded images properly.
     */
    const SQUIRE_CONFIG = {
        sanitizeToDOMFragment: (html, isPaste, self) => {
            // eslint-disable-next-line no-underscore-dangle
            const doc = self._doc;
            // Use proton's instance of DOMPurify to allow proton-src attributes to be displayed in squire.
            const frag = html ? sanitize.content(html) : null;
            return frag ? doc.importNode(frag, true) : doc.createDocumentFragment();
        }
    };

    Squire.prototype.testPresenceinSelection = function(name, action, format, validation) {
        if (name !== action) {
            return false;
        }

        const test = validation.test(this.getPath()) | this.hasFormat(format);
        return !!test;
    };

    /**
     * Load an iframe
     * @param  {jQLite}   $iframe
     * @param  {Function} cb      Callback on load
     * @return {void}
     */
    const loadIframe = ($iframe, cb) => {
        const iframe = $iframe[0];
        const iframeDoc = (iframe.contentDocument || iframe.contentWindow) && iframe.contentWindow.document;

        // Check if browser is Webkit (Safari/Chrome) or Opera
        if ($.ua.engine.name === 'WebKit') {
            // Start timer when loaded.
            $iframe.load(() => cb($iframe));

            // Safari and Opera need a kick-start.
            const source = iframe.getAttribute('src');
            iframe.setAttribute('src', '');
            return iframe.setAttribute('src', source);
        }

        if (iframeDoc && iframeDoc.readyState === 'complete') {
            return cb($iframe);
        }

        $iframe.load(() => cb($iframe));
    };

    /**
     * Custom CSS inside the IFRAME
     * @param  {Node} doc
     * @return {void}
     */
    const updateStylesToMatch = (doc) => {
        const head = doc.head || doc.getElementsByTagName('head')[0];
        const style = doc.createElement('style');

        const css = `
            html {
                height: 100%
            }

            body {
                height: 100%;
                box-sizing: border-box;
                padding: 1rem 10px 1rem 10px;
                font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
                font-size: 14px;
                line-height: 1.65em;
                color: #222;
            }

            blockquote {
                padding: 0 0 0 1rem;
                margin: 0;
                border-left: 4px solid #e5e5e5;
            }

            blockquote blockquote blockquote {
                padding-left: 0;
                margin-left: 0;
                border: none;
            }

            .proton-embedded:not([src]) {
                position: relative;
                min-height: 38px;
                border: 1px solid;
                border-color: #444 #CCC #CCC #444;
                background: url('/assets/img/icons/broken-img.png') no-repeat 0 50% white;
            }

            .proton-embedded:not([src]):not([alt]) {
                background-position-x: 50%;
            }

            .proton-embedded[alt]:not([src])::after {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                content: " " attr(alt);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                padding: 10px 0 0 20px;
                color: rgba(0,0,0,0.5);
                background: url('/assets/img/icons/broken-img.png') no-repeat 0 50% white;
            }

            /* see embedded.scss rules */
            .proton-embedded:not([width]):not([style*="width"]) {
                max-width: 100%;
                min-width: 38px;
            }

            .protonmail_signature_block-empty { display: none }

            .protonmail_quote {
                position: relative;
            }

            li {
                list-style-position: inside;
            }

            // Handle outlook https://github.com/ProtonMail/Angular/issues/6711
            p.MsoNormal, li.MsoNormal, div.MsoNormal {
                margin: 0;
            }
            `;

        style.setAttribute('type', 'text/css');
        style.setAttribute('rel', 'stylesheet');
        if (style.styleSheet) {
            style.styleSheet.cssText = css;
        } else {
            style.appendChild(doc.createTextNode(css));
        }
        head.appendChild(style);

        doc.childNodes[0].className = IFRAME_CLASS + ' ';
    };

    /**
     * Extend the EDITOR api
     * @param  {Squire} editor
     * @return {Squire}        Editor
     */
    const extendApi = (editor) => {
        editor.setTextDirectionLTR = () => editor.setTextDirection();
        editor.setTextDirectionRTL = () => editor.setTextDirection('rtl');
        // The default text direction function sets focus to the editor, which breaks the
        // custom focus used by the composer when setting the default text direction to be RTL.
        editor.setTextDirectionWithoutFocus = (direction) => {
            editor.forEachBlock((block) => {
                if (direction) {
                    block.dir = direction;
                } else {
                    block.removeAttribute('dir');
                }
            }, true);
        };
        editor.alignCenter = () => editor.setTextAlignment('center');
        editor.alignRight = () => editor.setTextAlignment('right');
        editor.alignCenter = () => editor.setTextAlignment('center');
        editor.alignLeft = () => editor.setTextAlignment('left');
        editor.alignJustify = () => editor.setTextAlignment('justify');
        editor.makeHeading = () => {
            editor.setFontSize('2em');
            return editor.bold();
        };
        return editor;
    };

    /**
     * Create a new instance of Squire and store it
     * Dispatch a squire.editor action (type: loaded) on load
     * @param  {jQLite} $iframe
     * @param  {Message} message
     * @return {Promise}
     */
    const create = ($iframe, message = {}, type) => {
        const { ID = 'editor' } = message;

        CACHE[ID] = type;

        return new Promise((resolve, reject) => {
            try {
                loadIframe($iframe, ($iframe) => {
                    const iframeDoc = $iframe[0].contentWindow.document;
                    updateStylesToMatch(iframeDoc);
                    const editor = editorModel.load({ ID }, extendApi(new Squire(iframeDoc, SQUIRE_CONFIG)), $iframe);

                    resolve(editor, $iframe);

                    // Defer the event to ensuire we register the listener
                    _rAF(() => {
                        dispatcher['squire.editor']('loaded', {
                            editor, $iframe, message
                        });
                    });
                });
            } catch (e) {
                console.error(e);
                reject(e);
            }
        });
    };

    const clean = (message) => {
        delete CACHE[message.ID];
        editorModel.remove(message);
    };

    const getType = ({ ID }) => CACHE[ID];

    return { create, clean, getType };
}

export default squireEditor;
