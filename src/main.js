import xs from "xstream";
import Cycle from "@cycle/xstream-run";
import {makeDOMDriver} from "@cycle/dom";
let app = require("./app").default;

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
};

const {sinks, sources, run} = Cycle(app, drivers);

run();
