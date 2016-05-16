import xs from "xstream";
import Cycle from "@cycle/xstream-run";
import {makeDOMDriver} from "@cycle/dom";
let app = require("./app").default;

function preventDefaultSinkDriver(prevented$) {
    prevented$.addListener({
        next: ev => {
            ev.preventDefault();
            if (ev.type === "blur") {
                ev.target.focus();
            }
        },
        error: () => {},
        complete: () => {}
    });
    return xs.empty();
}

const drivers = {
    DOM: makeDOMDriver("#main"),
    preventDefault: preventDefaultSinkDriver
};

const {sinks, sources, run} = Cycle(app, drivers);

run();
