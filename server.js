const U2F = require("u2f");
const Express = require("express");
const BodyParser = require("body-parser");
const Cors = require("cors");
const https = require("https");
const fs = require("fs");

const APP_ID = "https://localhost:2015";

var server = Express();

server.use(BodyParser.json());
server.use(BodyParser.urlencoded({ extended: true }));
server.use(Cors());

var user;

server.get("/",(req, res, next)=>{
    response.send({"message":"hellow world"});
})

server.post("/",(req, res, next)=>{
    response.send({"message":"hellow world"});
})


server.get("/register", (request, response, next) => {    console.log(session)
    console.log('qwewqe');
    var session = U2F.request(APP_ID);
    console.log(session)
    server.set("session", JSON.stringify(session));
    console.log(session)
    response.send(session);
});
server.post("/register", (request, response, next) => {
    var registration = U2F.checkRegistration(JSON.parse(server.get("session")), request.body.registerResponse);
    if(!registration.successful) {
        return response.status(500).send({ message: "error" });
    }
    user = registration;
    response.send(registration);
});
server.get("/login", (request, response, next) => {
    var session = U2F.request(APP_ID, user.keyHandle);
    server.set("session", JSON.stringify(session));
    response.send(session);
});
server.post("/login", (request, response, next) => {
    var success = U2F.checkSignature(JSON.parse(server.get("session")), request.body.loginResponse, user.publicKey);
    response.send(success);
});

const options = {
    key: fs.readFileSync('9149123_localhost.key'),
    cert: fs.readFileSync('9149123_localhost.cert')
};

https.createServer(options, function (req, res) {
    res.writeHead(200);
    res.end("hello world\n");
}).listen(8000, ()=>{
    console.log('works?')
});