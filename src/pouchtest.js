import * as dom from "@cycle/dom";
import xs from "xstream";
import debounce from "xstream/extra/debounce";

export default function app(sources) {
    const document$ = sources.PouchDB.getItem("test2", {
        "key": "value",
    });
    const input$ = sources.DOM.select("input").events("input").compose(debounce(1000)).map(ev => ev.target.value);
    const sinks = {
        DOM: document$.map(document => dom.input({
            props: { value: document.key },
        })),
        PouchDB: xs.combine(({ document, input }) => {
            document.key = input;
            return document;
        }, document$.map(document => input$.map(input => ({ document, input }))).flatten()),
    };

    return sinks;
}
