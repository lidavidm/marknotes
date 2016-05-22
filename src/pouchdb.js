import xs from "xstream";
import XStreamAdapter from "@cycle/xstream-adapter";
import PouchDB from "pouchdb";

function handleRequest(db) {
    return (request) => {
        switch (request.action) {
        case "put":
            db.put(request.document);
            return;
        default:
            throw "Unknown action " + request.action;
        }
    };
}

function makePouchDBDriver(localUrl, remoteUrl) {
    var pouchDBDriver = function(request$, runStreamAdapter) {
        const db = new PouchDB(localUrl);

        const pullEvents$ = xs.never();

        if (typeof remoteUrl !== "undefined") {
            console.log("Syncing to remote URL " + remoteUrl);
            const remoteDb = new PouchDB(remoteUrl);

            // Do a non-live sync once, to make sure we are up-to-date
            // and fire that event.
            db.sync(remoteDb).on("complete", function() {
                pullEvents$.shamefullySendNext(null);

                db.sync(remoteDb, {
                    live: true,
                    retry: true,
                }).on("change", function (info) {
                    if (info.direction === "pull") {
                        for (let doc of info.docs) {
                            pullEvents$.shamefullySendNext(doc._id);
                        }
                    }
                    console.log(info);
                }).on("paused", function (err) {
                    console.log("Paused", err);
                }).on("active", function () {
                    console.log("active");
                }).on("denied", function (err) {
                    console.log(err);
                }).on("complete", function (info) {
                    console.log("Complete", info);
                }).on("error", function (err) {
                    console.log(err);
                });
            });
            // TODO: provide changed$, error$, etc streams?
        }

        request$.addListener({
            next: handleRequest(db),
            error: () => {},
            complete: () => {},
        });

        const idChanges$ = xs.never();
        db.changes({
            since: "now",
            live: true,
        }).on("change", function(changes) {
            console.log("Changing", changes.id);
            idChanges$.shamefullySendNext(changes.id);
        });

        return {
            pullEvents$,
            getItem(key, initial) {
                console.log("Subscribing", key);
                db.get(key).then(val => {
                    item$.shamefullySendNext(val);
                }).catch(_ => {
                    console.log("Initializing", key);
                    initial._id = key;
                    item$.shamefullySendNext(initial);
                });
                const item$ =
                      xs.empty()
                      .merge(
                          idChanges$
                              .filter((id) => id === key)
                              .map(id => xs.fromPromise(db.get(id)))
                              .flatten()
                      );
                return runStreamAdapter.adapt(item$, XStreamAdapter.streamSubscribe);
            },
        };
    };

    pouchDBDriver.streamAdapter = XStreamAdapter;

    return pouchDBDriver;
}

export default makePouchDBDriver;
