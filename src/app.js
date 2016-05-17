import xs from "xstream";
import debounce from "xstream/extra/debounce";
import * as dom from "@cycle/dom";
import isolate from "@cycle/isolate";

import md from "markdown-it";
import mdTaskLists from "markdown-it-task-lists";

const parser = md().use(mdTaskLists);

function EditableTitle(sources) {
    const initialValue$ = sources.props$.map(props => props.initial);
    const newValue$ = sources.DOM.select("h1").events("input").map(ev => ev.target.textContent);

    const value$ = initialValue$.merge(newValue$).remember();

    const view$ = xs.combine((title) => {
        return dom.h1({ props: { contentEditable: true } }, title);
    }, value$);

    const sinks = {
        DOM: view$,
        value$,
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

function model(actions) {
    return {
        currentDocument$: actions.changeSource$.startWith(""),
    };
}

function view(noteTitle, state) {
    return xs.combine((titleVTree, markdown, title) => {
        return dom.div([
            dom.textarea(),
            titleVTree,
            dom.div({
                props: { innerHTML: parser.render(markdown) }
            }),
        ]);
    }, noteTitle.DOM, state.currentDocument$, noteTitle.value$);
}

export default function app(sources) {
    const noteTitle = isolate(EditableTitle)({
        DOM: sources.DOM,
        props$: xs.of({
            initial: "New Note",
        }),
    });

    const actions = intent(sources.DOM);
    const state$ = model(actions);
    const sinks = {
        DOM: view(noteTitle, state$),
        Title: noteTitle.value$.map(title => "Mark Notes: Editing " + title),
    };

    return sinks;
}
