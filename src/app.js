import xs from "xstream";
import debounce from "xstream/extra/debounce";
import * as dom from "@cycle/dom";
import * as uuid from "node-uuid";

import md from "markdown-it";
import mdTaskLists from "markdown-it-task-lists";

const parser = md().use(mdTaskLists);

function intent(sources) {
    return {
        syncDocument$: sources.PouchDB.pullEvents$.map(id => ({ event: "sync_document", id: id })),
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
        deleteDocument$: sources.DOM.select(".delete").events("click")
            .map(ev => ({ event: "delete_document", index: parseInt(ev.target.dataset.index, 10) })),
    };
}

function withLatestFrom(combine, source, other) {
    return other.map(o => source.map(s => combine(s, o))).flatten();
}

function model(sources, actions) {
    // TODO: need to garbage-collect unreachable notes
    const initDocument = [uuid.v4(), "New Document 1"];
    const documentPersist$ = sources.PouchDB.getItem("documents", {
        // [key, title]
        "documents": [initDocument],
    });

    // [key, index]
    const indexActions$ = actions.newDocument$
              .merge(actions.changeDocument$)
              .merge(actions.syncDocument$)
              .merge(actions.deleteDocument$);
    const currentIndex$ = withLatestFrom((event, documents) => {
        if (event.event === "new_document") {
            return [uuid.v4(), documents.documents.length - 1];
        }
        else if (event.event === "change_document") {
            return [documents.documents[event.index][0], event.index];
        }
        else if (event.event === "sync_document") {
            // TODO: need to preserve which note the user is actually looking at
            if (event.id === null) {
                return [documents.documents[0][0], 0];
            }
            // TODO: handle case where other document is synced
        }
        else if (event.event === "delete_document") {
            let index = event.index;
            if (event.index >= documents.documents.length) {
                index = documents.documents.length - 1;
            }
            return [documents.documents[index][0], index];
        }
        throw "Invalid event: " + event.event;
    }, indexActions$, documentPersist$).startWith([initDocument[0], 0]).remember();

    const documentIndex$ = xs.combine((documents, index) => {
        return {
            document: documents,
            id: index[0],
            index: index[1],
        };
    }, documentPersist$, currentIndex$);

    const documentActions$ = actions.newDocument$.merge(actions.changeTitle$).merge(actions.deleteDocument$);

    const documentList$ =
              documentPersist$.take(1).map(docs => docs.documents)
              .merge(withLatestFrom((event, persist) => {
                  if (event.event === "new_document") {
                      persist.document.documents.push([
                          uuid.v4(),
                          "New Document " + (persist.document.documents.length + 1),
                      ]);
                  }
                  else if (event.event === "new_title") {
                      persist.document.documents[persist.index][1] = event.title;
                  }
                  else if (event.event === "delete_document") {
                      console.log("Deleting", persist.id);
                      persist.document.documents.splice(persist.index, 1);
                      // TODO: delete the document
                  }
                  else if (event.event === "sync_document") {
                      // TODO: check if the initial document up there
                      // is in the document list still; if not, delete
                      // it
                      console.log(event);
                  }
                  return persist.document.documents;
              }, documentActions$.merge(actions.syncDocument$), documentIndex$));

    const currentDocumentPersist$ = currentIndex$.map(([id, _index]) => {
        return sources.PouchDB.getItem(id, {
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
            else if (event.event === "sync_document") {
                console.log("Synced document", event, persist);
            }
            return persist;
        }, actions.changeBody$.merge(actions.syncDocument$), currentDocumentPersist$));
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
    return xs.combine((documentList, [uuid, currentIndex], document) => {
        const list = documentList.map(
            ([_id, title], index) =>
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

        // Because we use xs.combine, the document list might update
        // before the index does
        if (currentIndex >= documentList.length) {
            currentIndex -= 1;
        }

        return dom.div([
            documentListVTree,
            dom.h("article#current-document", [
                dom.header([
                    dom.h1({
                        class: { title: true },
                    }, [dom.input({ props: { type: "text", value: documentList[currentIndex][1] } })]),
                    dom.nav([
                        dom.h("button.delete", {
                            attrs: { "data-index": currentIndex },
                        }, "Delete"),
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
    return withLatestFrom((_, persist) => ({
        action: "put",
        document: persist,
    }), event$, persist$);
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
