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

function DocumentList(sources) {
    const view$ = xs.combine((documents) => {
        return dom.nav("#document-list", documents.map(document => dom.div(document.title)));
    }, sources.documentList$);

    const sinks = {
        DOM: view$,
    };

    return sinks;
}

function intent(DOM) {
    return {
        changeSource$: DOM.select("textarea").events("keyup")
            .compose(debounce(500))
            .map(ev => ev.target.value),
    };
}

function model(actions, currentTitle$) {
    const currentIndex$ = xs.of(0).remember();
    const documentList = [{
        title: "New Note",
    }];

    return {
        currentIndex$: currentIndex$,
        documentList$: xs.combine((index, title) => {
            documentList[index].title = title;
            return documentList;
        }, currentIndex$, currentTitle$).startWith(documentList).remember(),
        currentDocument$: xs.combine((title, body) => {
            return {
                title: title,
                body: body,
            };
        }, currentTitle$, actions.changeSource$).startWith({
            title: "New Note",
            body: "Enter your note here.",
        }),
    };
}

function view(documentList, noteTitle, state) {
    return xs.combine((documentListVTree, titleVTree, document) => {
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
    }, documentList.DOM, noteTitle.DOM, state.currentDocument$);
}

export default function app(sources) {
    const noteTitle = isolate(EditableTitle)({
        DOM: sources.DOM,
        props$: xs.of({
            initial: "New Note",
        }),
    });

    const actions = intent(sources.DOM);
    const state = model(actions, noteTitle.value$);

    const documentList = isolate(DocumentList)({
        DOM: sources.DOM,
        documentList$: state.documentList$,
    });

    const sinks = {
        DOM: view(documentList, noteTitle, state),
        Title: noteTitle.value$.map(title => "Mark Notes: Editing " + title),
    };

    return sinks;
}
