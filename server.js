var express = require('express')
//var fs = require('fs')
var app = express()
const BodyParser = require("body-parser");

app.use(BodyParser.json());

// For debugging
let today = new Date()
const tomorrow = new Date(today)
tomorrow.setDate(tomorrow.getDate() - 1)

let dateList = [tomorrow]

let passwordList = ['ccccccvbigrr'];


app.post('/', function(request, response) {
    let result = checkPasswordAndDate(request.body.password);
    console.log(request.body.password);
    response.writeHead(200);
    response.end(result.toString());
})

function checkPasswordAndDate(pass){

    today = new Date();
    let publicPass = pass.slice(pass.length-44,pass.length-32);
    for (let i=0;i<passwordList.length;++i){
    	if (publicPass === passwordList[i]) return today <= dateList[i];
    }
    return false;

}

const port = 8000
app.listen(port)
console.log(`Listening at http://localhost:${port}`)
