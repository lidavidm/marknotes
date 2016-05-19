import xs from "xstream";
import Cycle from "@cycle/xstream-run";
import {makeDOMDriver} from "@cycle/dom";
import app from "./app";

import PouchDBDriver from "./pouchdb";

function TitleDriver(title$) {
    title$.addListener({
        next: title => {
            document.querySelector("title").textContent = title;
        },
        error: () => {},
        complete: () => {},
    });
}

const drivers = {
    DOM: makeDOMDriver("#main"),
    Title: TitleDriver,
    PouchDB: PouchDBDriver,
};

const {sinks, sources, run} = Cycle(app, drivers);

run();
