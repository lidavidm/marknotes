import xs from "xstream";
import debounce from "xstream/extra/debounce";
import * as dom from "@cycle/dom";

import md from "markdown-it";
import mdTaskLists from "markdown-it-task-lists";

const parser = md().use(mdTaskLists);

function intent(sources) {
    return {
        newDocument$: sources.DOM.select(".add-document").events("click").mapTo({ event: "new_document" }),
        changeDocument$: sources.DOM.select("#document-list .document").events("click").map(ev => ({
            event: "change_document",
            index: parseInt(ev.target.dataset.index, 10),
        })),
        changeTitle$: sources.DOM.select(".title").events("input").compose(debounce(500)).map(ev => ({
            event: "new_title",
            title: ev.target.value,
        })),
        changeBody$: sources.DOM.select("textarea").events("keyup")
            .compose(debounce(250))
            .map(ev => ({
                event: "new_body",
                body: ev.target.value,
            })),
        deleteDocument$: sources.DOM.select(".delete").events("click").mapTo({ event: "delete_document" }),
    };
}

function withLatestFrom(combine, source, other) {
    return other.map(o => source.map(s => combine(s, o))).flatten();
}

function model(sources, actions) {
    const documentPersist$ = sources.PouchDB.getItem("documents", {
        "documents": ["New Document 1"],
    });

    const currentIndexRaw$ = withLatestFrom((event, documents) => {
        if (event.event === "new_document") {
            return documents.documents.length - 1;
        }
        else if (event.event === "change_document") {
            return event.index;
        }
        throw "Invalid event: " + event.event;
    }, actions.newDocument$.merge(actions.changeDocument$), documentPersist$).startWith(0).remember();

    const currentIndex$ = xs.combine((documents, rawIndex) => {
        return Math.min(rawIndex, documents.documents.length - 1);
    }, documentPersist$, currentIndexRaw$);

    const documentIndex$ = xs.combine((documents, index) => {
        return {
            document: documents,
            index: index,
        };
    }, documentPersist$, currentIndex$);

    const documentActions$ = actions.newDocument$.merge(actions.changeTitle$).merge(actions.deleteDocument$);

    const documentList$ =
              documentPersist$.take(1).map(docs => docs.documents)
              .merge(withLatestFrom((event, persist) => {
                  if (event.event === "new_document") {
                      persist.document.documents.push("New Document " + (persist.document.documents.length + 1));
                  }
                  else if (event.event === "new_title") {
                      persist.document.documents[persist.index] = event.title;
                  }
                  else if (event.event === "delete_document") {
                      persist.document.documents.splice(persist.index, 1);
                  }
                  return persist.document.documents;
              }, documentActions$, documentIndex$));

    const currentDocumentPersist$ = currentIndex$.map(index => {
        return sources.PouchDB.getItem(index.toString(), {
            "body": "Enter your notes here.",
            "created": Date.now(),
            "modified": Date.now(),
        });
    }).flatten();
    const currentDocument$ = currentIndex$.map(_ => {
        return currentDocumentPersist$.take(1).merge(withLatestFrom((event, persist) => {
            if (event.event === "new_body") {
                persist.body = event.body;
                persist.modified = Date.now();
            }
            return persist;
        }, actions.changeBody$, currentDocumentPersist$));
    }).flatten();

    return {
        documentPersist$,
        currentIndex$,
        documentList$,
        currentDocument$,
        currentDocumentPersist$,
    };
}

function view(state) {
    return xs.combine((documentList, currentIndex, document) => {
        const list = documentList.map(
            (title, index) =>
                dom.li({
                    class: { active: index === currentIndex, document: true },
                    attrs: { "data-index": index }
                }, title));
        list.push(dom.h("li.add-document", [ dom.button("New Document") ]));
        const documentListVTree = dom.h("nav#document-list", [
            dom.ul(list),
        ]);

        const created = new Date(document.created);
        const modified = new Date(document.modified);

        return dom.div([
            documentListVTree,
            dom.h("article#current-document", [
                dom.header([
                    dom.h1({
                        class: { title: true },
                    }, [dom.input({ props: { type: "text", value: documentList[currentIndex] } })]),
                    dom.nav([
                        dom.h("button.delete", "Delete"),
                    ]),

                    dom.h("time.created", { attrs: {
                        datetime: created.toISOString(),
                    }}, ["Created ", created.toLocaleString()]),
                    dom.h("time.modified", { attrs: {
                        datetime: modified.toISOString(),
                    }}, ["Modified ", modified.toLocaleString()]),
                ]),
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

function persistWhen(persist$, event$) {
    return withLatestFrom((_, persist) => persist, event$, persist$);
}

export default function app(sources) {
    const actions = intent(sources);
    const state = model(sources, actions);

    const sinks = {
        DOM: view(state),
        Title: xs.combine((documents, index) => "Mark Notes: Editing " + documents[index],
                          state.documentList$, state.currentIndex$),
        PouchDB: persistWhen(state.documentPersist$, state.documentList$)
            .merge(persistWhen(state.currentDocumentPersist$, state.currentDocument$)),
    };

    return sinks;
}
