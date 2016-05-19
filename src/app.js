import xs from "xstream";
import debounce from "xstream/extra/debounce";
import * as dom from "@cycle/dom";

import md from "markdown-it";
import mdTaskLists from "markdown-it-task-lists";

const parser = md().use(mdTaskLists);

function intent(sources) {
    return {
        newDocument$: sources.DOM.select(".add-document").events("click"),
        changeTitle$: sources.DOM.select(".title").events("input").map(ev => ev.target.value),
        changeSource$: sources.DOM.select("textarea").events("keyup")
            .compose(debounce(250))
            .map(ev => ev.target.value),
    };
}

function withLatestFrom(combine, source, other) {
    return other.map(o => source.map(s => combine(s, o))).flatten();
}

function model(sources, actions) {
    const documentPersist$ = sources.PouchDB.getItem("documents", {
        "documents": ["New Document 1"],
    });

    const currentIndex$ = withLatestFrom((_, documents) => {
        return documents.documents.length - 1;
    }, actions.newDocument$, documentPersist$).startWith(0).remember();

    const documentIndex$ = xs.combine((documents, index) => {
        return {
            document: documents,
            index: index,
        };
    }, documentPersist$, currentIndex$);

    const documentActions$ = actions.newDocument$.mapTo({ event: "new_document" })
              .merge(actions.changeTitle$.compose(debounce(500)).map(newTitle => ({ event: "new_title", title: newTitle })));

    const documentList$ =
              documentPersist$.take(1).map(docs => docs.documents)
              .merge(withLatestFrom((event, persist) => {
                  if (event.event === "new_document") {
                      persist.document.documents.push("New Document");
                  }
                  else if (event.event === "new_title") {
                      persist.document.documents[persist.index] = event.title;
                  }
                  return persist.document.documents;
              }, documentActions$, documentIndex$));

    return {
        documentPersist$,
        currentIndex$,
        documentList$,
        currentDocument$: xs.combine((persist, body) => {
            return {
                title: persist.document.documents[persist.index],
                body: body,
            };
        }, documentIndex$, actions.changeSource$).startWith({
            title: "New Document",
            body: "Enter your document here.",
        }),
    };
}

function view(state) {
    return xs.combine((documentList, currentIndex, document) => {
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
                dom.h1({
                    class: { title: true },
                }, [dom.input({ props: { type: "text", value: document.title } })]),
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
    }, state.documentList$, state.currentIndex$, state.currentDocument$);
}

export default function app(sources) {
    const actions = intent(sources);
    const state = model(sources, actions);

    const sinks = {
        DOM: view(state),
        Title: state.currentDocument$.map(document => "Mark Notes: Editing " + document.title),
        PouchDB: withLatestFrom((_, persist) => {
            return persist;
        }, state.documentList$, state.documentPersist$),
    };

    return sinks;
}
