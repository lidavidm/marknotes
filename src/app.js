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
    const currentIndex$ = xs.of(0).remember();
    const documentList = [{
        title: "New Document",
    }];

    const documentList$ = xs.combine((index, title) => {
        documentList[index].title = title;
        return documentList;
    }, currentIndex$, sources.currentTitle$).startWith(documentList).remember();

    const view$ = xs.combine((documents, currentIndex) => {
        const list = documents.map(
            (document, index) =>
                dom.li({ class: { active: index === currentIndex } }, document.title));
        list.push(dom.h("li.add-document", [ dom.button("New Document") ]));
        return dom.h("nav#document-list", [
            dom.ul(list),
        ]);
    }, documentList$, currentIndex$);

    const sinks = {
        DOM: view$,
        currentIndex$,
        documentList$,
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

function model(actions, currentTitle$, documentList$, currentIndex$) {
    return {
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

function view(documentList, documentTitle, state) {
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
    }, documentList.DOM, documentTitle.DOM, state.currentDocument$);
}

export default function app(sources) {
    const documentTitle = isolate(EditableTitle)({
        DOM: sources.DOM,
        props$: xs.of({
            initial: "New Document",
        }),
    });

    const documentList = isolate(DocumentList)({
        DOM: sources.DOM,
        currentTitle$: documentTitle.value$,
    });

    const actions = intent(sources.DOM);
    const state = model(actions, documentTitle.value$, documentList.documentList$, documentList.currentIndex$);

    const sinks = {
        DOM: view(documentList, documentTitle, state),
        Title: documentTitle.value$.map(title => "Mark Notes: Editing " + title),
    };

    return sinks;
}
