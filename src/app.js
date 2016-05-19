import xs from "xstream";
import debounce from "xstream/extra/debounce";
import * as dom from "@cycle/dom";
import isolate from "@cycle/isolate";

import md from "markdown-it";
import mdTaskLists from "markdown-it-task-lists";

const parser = md().use(mdTaskLists);

function EditableTitle(sources) {
    const initialValue$ = sources.props$.map(props => props.initial);
    const newValue$ = sources.DOM.select("input").events("input").map(ev => ev.target.value);

    const value$ = initialValue$.merge(newValue$).remember();

    const view$ = xs.combine((title) => {
        return dom.h1([dom.input({ props: { type: "text", value: title } })]);
    }, value$);

    const sinks = {
        DOM: view$,
        value$,
    };

    return sinks;
}

function intent(sources) {
    return {
        newDocument$: sources.DOM.select(".add-document").events("click"),
        changeSource$: sources.DOM.select("textarea").events("keyup")
            .compose(debounce(250))
            .map(ev => ev.target.value),
    };
}

function withLatestFrom(combine, source, other) {
    return other.map(o => source.map(s => combine(s, o))).flatten();
}

function model(sources, actions, currentTitle$) {
    const documentPersist$ = sources.PouchDB.getItem("documents", {
        "documents": ["New Document 1"],
    });

    const documentList$ =
              documentPersist$.take(1).map(docs => docs.documents)
              .merge(withLatestFrom((_, documents) => {
                  documents.documents.push("New Document");
                  return documents.documents;
              }, actions.newDocument$, documentPersist$));
    const currentIndex$ = withLatestFrom((_, documents) => {
        return documents.documents.length - 1;
    }, actions.newDocument$, documentPersist$).startWith(0).remember();

    return {
        documentPersist$,
        currentIndex$,
        documentList$,
        currentDocument$: xs.combine((title, body) => {
            return {
                title: title,
                body: body,
            };
        }, currentTitle$, actions.changeSource$).startWith({
            title: "New Document",
            body: "Enter your document here.",
        }),
    };
}

function view(documentTitle, state) {
    return xs.combine((titleVTree, documentList, currentIndex, document) => {
        const list = documentList.map(
            (title, index) =>
                dom.li({ class: { active: index === currentIndex } }, title));
        list.push(dom.h("li.add-document", [ dom.button("New Document") ]));
        const documentListVTree = dom.h("nav#document-list", [
            dom.ul(list),
        ]);

        return dom.div([
            documentListVTree,
            dom.h("article#current-document", [
                titleVTree,
                dom.h("section.body", [
                    dom.textarea({
                        props: { value: document.body },
                    }),
                    dom.article({
                        props: { innerHTML: parser.render(document.body) }
                    }),
                ]),
            ]),
        ]);
    }, documentTitle.DOM, state.documentList$, state.currentIndex$, state.currentDocument$);
}

export default function app(sources) {
    const documentTitle = isolate(EditableTitle)({
        DOM: sources.DOM,
        props$: xs.of({
            initial: "New Document",
        }),
    });

    const actions = intent(sources);
    const state = model(sources, actions, documentTitle.value$);

    const sinks = {
        DOM: view(documentTitle, state),
        Title: documentTitle.value$.map(title => "Mark Notes: Editing " + title),
        PouchDB: withLatestFrom((_, persist) => {
            return persist;
        }, state.documentList$, state.documentPersist$),
    };

    return sinks;
}
