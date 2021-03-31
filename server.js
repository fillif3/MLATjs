/*const U2F = require("u2f");
const Express = require("express");
const BodyParser = require("body-parser");
const Cors = require("cors");
const https = require("https");
const fs = require("fs");
const response = require("express");

const APP_ID = "https://localhost:2015";

var server = Express();

server.use(BodyParser.json());
//server.use(BodyParser.urlencoded({ extended: true }));
//server.use(Cors());

var user;

server.get("/",(req, res, next)=>{
    console.log('hellow get');
    response.send({"message":"hellow world"});
})

server.post("/",(req, response, next)=>{
    console.log('hellow world');
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
    //var session = U2F.request(APP_ID, user.keyHandle);
    //server.set("session", JSON.stringify(session));
    //response.send(session);
    console.log('hellow get');
    response.send({"message":"hellow world"});
});
server.post("/login", (request, response, next) => {
    //var success = U2F.checkSignature(JSON.parse(server.get("session")), request.body.loginResponse, user.publicKey);
    //response.send(success);
    console.log('hellow world');
    response.send({"message":"hellow world"});
});

const options = {
    key: fs.readFileSync('9149123_localhost.key'),
    cert: fs.readFileSync('9149123_localhost.cert')
};

https.createServer(options, function (req, res) {
    res.writeHead(200);
    //res.end("hello worldasd\n");
}).listen(8000, ()=>{
    console.log('works?')
});*/

var express = require('express')
var fs = require('fs')
var app = express()
const BodyParser = require("body-parser");

app.use(BodyParser.json());

app.get('/', function(request, response) {
    var html = `
    <html>
        <body>
            <form method="post" action="http://localhost:8000">Name: 
                <input type="text" name="name" />
                <input type="submit" value="Submit" />
            </form>
        </body>
    </html>`
    response.writeHead(200, {'Content-Type': 'text/html'})
    response.end(html)
})

app.post('/', function(request, response) {
    let result = checkPassword(request.body.password);
    console.log(request.body.password);
    response.writeHead(200);
    response.end(result.toString());
})

function checkPassword(pass){

    let truePassword ='ccccccvbigrr';
    return (pass.slice(pass.length-44,pass.length-32) === truePassword);

}

const port = 8000
app.listen(port)
console.log(`Listening at http://localhost:${port}`)