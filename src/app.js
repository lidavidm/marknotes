import xs from "xstream";
import debounce from "xstream/extra/debounce";
import * as dom from "@cycle/dom";

import md from "markdown-it";
import mdTaskLists from "markdown-it-task-lists";

const parser = md().use(mdTaskLists);

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

function view(state) {
    return state.currentDocument$.map(markdown => dom.div([
        dom.textarea(),
        dom.div({
            props: { innerHTML: parser.render(markdown) }
        }),
    ]));
}

export default function app(sources) {
    const actions = intent(sources.DOM);
    const state$ = model(actions);
    const sinks = {
        DOM: view(state$),
    };

    return sinks;
}
