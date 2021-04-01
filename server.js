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


    let truePassword ='ccccccvbigrr';//
    return (pass.slice(pass.length-44,pass.length-32) === truePassword);

}

const port = 8000
app.listen(port)
console.log(`Listening at http://localhost:${port}`)