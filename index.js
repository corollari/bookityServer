var http = require("http");
var fs = require("fs");
var parseURL = require("url");
var crypto = require("crypto");
var math = require('mathjs');
var ISBN = require('isbn').ISBN;
var MongoClient = require('mongodb').MongoClient;
var mongoUrl = "mongodb://localhost:27017/mydb";

function hash(passwd) {
    return crypto.createHmac('sha256', passwd)
        .digest('hex');
}

MongoClient.connect(mongoUrl, function(mongoErr, db) {
    if (mongoErr) throw mongoErr;
    usersDB = db.collection("users");

    //Startup
    buildMatrixes(function() {
        app.listen(80)
    });
    //Finished startup

    var app = http.createServer(serverHandle);
    var io = require('socket.io')(app);

    function registerUser(username2add, password2add, callback) {
        usersDB.findOne({
            username: username2add
        }, function(err, result) {
            if (err) throw err;
            if (result != null) {
                callback({
                    error: true,
                    msg: "username already registered"
                });
            } else {
                var newUser = {
                    username: username2add,
                    passwordHash: hash(password2add),
                    isbns: [],
                    liked: [],
                    disliked: [],
                    offlineMessages: []
                };
                usersDB.insertOne(newUser, function(err, res) {
                    if (err) {
                        callback({
                            error: true,
                            msg: "database error!"
                        });
                    } else {
                        callback({
                            error: false
                        });
                    }
                });
            }
        });
    }

    function getUser(username2get, callback) {
        usersDB.findOne({
            username: username2get
        }, function(err, result) {
            if (err) throw err;
            console.log("User logged");
            console.log(result);
            callback(result);
        });
    }

    function serverHandle(req, res) {
        //console.log(req.url);
        var url = parseURL.parse(req.url, true);
        switch (url.pathname) {
            case "/api":
                var username = url.query.user;
                var password = url.query.password;
                var action = url.query.action;
                if (password != undefined && username != undefined) {
                    switch (action) {
                        case "register":
                            registerUser(username, password, function(msg) {
                                res.end(JSON.stringify(msg))
                            });
                            break;
                        default:
                            getUser(username, function(user) {
                                if (user == null) {
                                    res.end(JSON.stringify({
                                        error: true,
                                        msg: "user doesn't exist"
                                    }));
                                } else {
                                    if (user.passwordHash == hash(password)) {
                                        switch (action) {
                                            case "login":
                                                res.end(JSON.stringify({
                                                    isbns: user.isbns,
                                                    error: false,
                                                    msg: "success"
                                                }));
                                                break;
                                            case "addbook": //TODO: Add isbn validation (check if the isbn is a valid one)
                                                var isbn2add = url.query.isbn;
                                                if (isValidISBN(isbn2add)) {
                                                    user.isbns.push(isbn2add);
                                                    usersDB.updateOne({
                                                        username: username
                                                    }, {
                                                        $set: {
                                                            isbns: user.isbns
                                                        }
                                                    }, function(err, res) {});
                                                }
                                                break;
                                            case "likebook":
                                                var isbn2add = url.query.isbn;
                                                if (isValidISBN(isbn2add)) {
                                                    user.liked.push(isbn2add);
                                                    usersDB.updateOne({
                                                        username: username
                                                    }, {
                                                        $set: {
                                                            liked: user.liked
                                                        }
                                                    }, function(err, res) {});
                                                }
                                                break;
                                            case "dislikebook":
                                                var isbn2add = url.query.isbn;
                                                if (isValidISBN(isbn2add)) {
                                                    user.disliked.push(isbn2add);
                                                    usersDB.updateOne({
                                                        username: username
                                                    }, {
                                                        $set: {
                                                            disliked: user.disliked
                                                        }
                                                    }, function(err, res) {});
                                                }
                                                break;
                                            case "getbooks4swipe":
                                                res.end(JSON.stringify(getTopBooks(username)));
                                                break;
                                        }
                                    } else {
                                        res.end(JSON.stringify({
                                            error: true,
                                            msg: "wrong password"
                                        }));
                                    }
                                }
                            });
                    }
                } else {
                    res.end("wrong usage");
                }
                break;
            case "/book":
                if (url.query.isbn)
                    getTitle(url.query.isbn, function(title) {
                        res.end(title)
                    });
                break;
            case "/":
            case "/index.html":
                fs.createReadStream("index.js").pipe(res);
                break;
            default:
                res.end("404");
        }
    }

    function isValidISBN(isbn) {
        if (ISBN.parse(isbn) == null) {
            return false;
        } else {
            return true;
        }
    }

    //TODO: Test offline messaging
    var sockets = {};
    io.on('connection', function(socket) {
        socket.on('login', function(dataRaw) {
            var data = JSON.parse(dataRaw);
            console.log(data.user);
            getUser(data.user, function(user) {

                if (user != null && user.passwordHash == hash(data.password)) {
                    sockets[data.user] = socket;
                    console.log("loggeado bien en chat");
                    for (var i = 0; i < user.offlineMessages.length; i++) {
                        socket.emit("receive", user.offlineMessages[i]);
                    }

                    socket.on('disconnect', function() {
                        sockets[data.user] = undefined;
                    });
                    socket.on('send', function(newDataRaw) {
                        var newData = JSON.parse(newDataRaw);
                        if (sockets[newData.user] != undefined) {
                            console.log(newData);
                            sockets[newData.user].emit("receive", {
                                msg: newData.msg,
                                from: data.user,
                                date: new Date()
                            });
                        } else {
                            getUser(newData.user, function(destinationUser) {
                                if (destinationUser != null) {
                                    destinationUser.offlineMessages.push({
                                        msg: newData.msg,
                                        from: data.user,
                                        date: new Date()
                                    });
                                    usersDB.updateOne({
                                        username: destinationUser.username
                                    }, {
                                        $set: {
                                            offlineMessages: destinationUser.offlineMessages
                                        }
                                    }, function(err, res) {});
                                }
                            });
                        }
                    });
                }
            });
        });
    });

    var initialIsbns, usersM, userIndexes; //Optimization: Should usersM be defined as a "sparse" matrix? (Look up math.js documentation)

    function getTopBooks(username) { //TODO: Integrate the matrix code into buildMatrixes?
        var nbooks = initialIsbns.length;
        var userM = math.subset(usersM, math.index(userIndexes.indexOf(username), math.range(0, nbooks))); //BUG: Breaks when there's only 1 book in the database
        console.log(userM);
        var vectorFinal = math.dotMultiply(math.subtract(math.ones(1, nbooks), userM), math.multiply(math.multiply(userM, math.transpose(usersM)), usersM)).toArray()[0];
        console.log(vectorFinal);
        var indexes = math.range(0, nbooks).toArray();
        console.log(indexes);
        indexes = math.sort(indexes, function(a, b) {
            return vectorFinal[a] < vectorFinal[b]
        });
        console.log(indexes);
        var isbns = [];
        for (var i = 0; i < nbooks; i++) {
            isbns[i] = initialIsbns[indexes[i]];
        }
        return isbns;
    }

    //TODO: Code a better way to call buildMatrixes regularly (eg: every hour, when there's low load...)
    setInterval(buildMatrixes, 30 * 60 * 1000); //Runs every 30 mins

    function buildMatrixes(callback) {
        usersDB.find({}, {
            isbns: true,
            liked: true,
            disliked: true,
            username: true,
            _id: false
        }).toArray(function(err, results) {
            //console.log(results);
            initialIsbns = [];
            for (var i = 0; i < results.length; i++) {
                var k = results[i].isbns;
                for (var j = 0; j < k.length; j++) {
                    if (initialIsbns.indexOf(k[j]) < 0) {
                        initialIsbns.push(k[j]);
                    }
                }
            }
            userIndexes = [];
            usersM = math.zeros(results.length, initialIsbns.length);
            for (var i = 0; i < results.length; i++) {
                var k = results[i].isbns.concat(results[i].liked);
                for (var j = 0; j < k.length; j++) {
                    usersM.subset(math.index(i, initialIsbns.indexOf(k[j])), 1);
                }
                userIndexes.push(results[i].username);
            }
            console.log("buildMatrixes() run");
            typeof callback === 'function' && callback();
        });

    }

});

function getTitle(isbn, callback) {
    var options = {
        host: 'isbndb.com',
        path: '/api/v2/json/1W05HJBT/book/' + isbn,
        port: '80',
        method: 'GET',
    };
    // Sets up the request
    var req = http.request(options, function(res) {
        res.setEncoding('utf8');
        var body = "";
        res.on('data', function(chunk) {
            body += chunk;
        });
        res.on("end", function() {
            callback(JSON.parse(body).data[0].title);
        });
    });
    req.on('error', (e) => {
        console.error('problem with request: ${e.message}');
        callback("error");
    });
    req.end();
}