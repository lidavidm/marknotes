import xs from "xstream";
import XStreamAdapter from "@cycle/xstream-adapter";
import PouchDB from "pouchdb";

function handleRequest(db) {
    return (request) => {
        console.log("Writing", request);
        db.put(request);
    };
}

function makePouchDBDriver(localUrl, remoteUrl) {
    var pouchDBDriver = function(request$, runStreamAdapter) {
        const db = new PouchDB(localUrl);

        if (typeof remoteUrl !== "undefined") {
            const remoteDb = new PouchDB(remoteUrl);

            db.sync(remoteDb, {
                live: true,
                retry: true,
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
