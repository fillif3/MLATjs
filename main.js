const { app, BrowserWindow,ipcMain,Menu,MenuItem ,dialog} = require('electron')
const path = require("path");
const fs = require("fs");
const math = require("mathjs");
const u2f = require('u2f');
const Express = require("express");
const BodyParser = require("body-parser");
const https = require("https");
const Cors = require("cors");




const _semimajor_axis = 6378137.0;
const _semiminor_axis = 6356752.31424518

let win;
let winHelper;
let savePath =null;

const template = [
    {
      label: 'File',
      submenu: [
          {
              label:'New',
              accelerator: 'Ctrl+N',
              click(){
                  win.webContents.send("fromMain", ['clear']);
                  savePath =null;
              }
          },
          {
              label: 'Open',
              accelerator: 'Ctrl+O',
              click(){
                  openFile();
              }
          },
          {
              label: 'Save',
              accelerator: 'Ctrl+S',
              click() {
                  saveWithPath();
              }
          },
          {
              label: 'Save As',
              accelerator: 'Ctrl+Shift+S',
              click() {
                saveAs(true );
              }
          },
          {
              label: 'Save Copy',
              accelerator: 'Alt+Shift+S',
              click() {
                  saveAs(false);
              }
          },
          {
              type: 'separator'
          },
          {
              label: 'Load example 1',
              accelerator: 'Ctrl+1',
              click(){
                  win.webContents.send("fromMain", ['Example',1]);
              }
          },
          {
              label: 'Load example 2',
              accelerator: 'Ctrl+2',
              click(){
                  win.webContents.send("fromMain", ['Example',2]);
              }
          },



      ]
    },
    {
        label: 'Edit',
        submenu: [
            {
                role: 'undo'
            },
            {
                role: 'redo'
            },
            {
                type: 'separator'
            },
            {
                role: 'cut'
            },
            {
                role: 'copy'
            },
            {
                role: 'paste'
            }
        ]
    },

    {
        label: 'View',
        submenu: [
            {
                role: 'reload'
            },
            {
                role: 'toggledevtools'
            },
            {
                type: 'separator'
            },
            {
                role: 'resetzoom'
            },
            {
                role: 'zoomin'
            },
            {
                role: 'zoomout'
            },
            /*{
                type: 'separator'
            },
            {

                role: 'togglefullscreen',
                click(){
                    win.setMenuBarVisibility(false)
                }
            }*/
        ]
    },

    {
        role: 'window',
        submenu: [
            {
                role: 'minimize'
            },
            {
                role: 'close'
            }
        ]
    },

    {
        role: 'help',
        submenu: [
            {
                label: 'Learn More',
                click() {
                    createWindow(true);
                }
            },
            {
                label: 'License',
                click() {
                    createWindow(true);
                }
            },
        ]
    }
]

const menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)

let stopFlag;

function createWindow (isNotMain) {
    if (!isNotMain) {
        win = new BrowserWindow({
            width: 1200,
            height: 800,
            title: "Localization measurnment error - accuracy",
            autoHideMenuBar: false,
            webPreferences: {
                nodeIntegration: true,
                preload: path.join(__dirname, "preload.js")
            }
        })

        win.maximize();
        ipcMain.on('request-update-label-in-second-window', (event, arg) => {
            win.webContents.send('action-update-label', arg);
        });
        win.setMenu(null);
        win.loadFile('index.html');
    } else{
        winHelper = new BrowserWindow({
            width: 1200,
            height: 800,
            title: "Help",
        })
        winHelper.loadFile('LICENSES.chromium.html');
        winHelper.setMenu(null);
    }
}

app.whenReady().then(createWindow)


ipcMain.on("toMain", (event, args) => {
    if (args[0]=='load') {
        fs.readFile(args[1], 'utf8', (err, data) => {
            if (err!=null) {
                win.webContents.send("fromMain", ['error']);
                return null;
            }
            win.webContents.send("fromMain", ['load',data]);
        });
    } else if (args[0]=='save'){
        console.log(args[1],args[2])
        fs.writeFile(args[1],args[2], (err) => {
            console.log('save')
           if (err!=null) {
               console.log('saveerr')
               win.webContents.send("fromMain", ['error']);
               return null;

           }
            console.log('save')
        });
    } else if (args[0]=='check'){
        fs.readdir('saves/', (err, files) => {
            if (err!=null){
                win.webContents.send("fromMain", ['error']);
                return null;
            }
            win.webContents.send("fromMain", ['check',files]);
        });

    } else if (args[0]=='delete'){
        try {
            fs.unlinkSync(args[1])
            //file removed
        } catch(err) {
            win.webContents.send("fromMain", ['error']);
        }
    } else if (args[0]=='exit'){
        app.quit()
    } else if (args[0]=='VDOP'){
        let currentLatitude= args[2].get('min_latitude');
        console.log(Date.now(),'start VDOP');
        stopFlag=false;
        computeVDOP(args[1],args[2],args[3],args[4],args[5],args[6],args[7],args[8],currentLatitude)

    } else if  (args[0]=='Stop'){
        stopFlag=true;
    } else if  (args[0]=='clearSavePath'){
        savePath =null;
    }else if  (args[0]=='setMenu'){
        win.setMenu(menu);
    }

});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(false)
  }
})

// Computing VDOP

function computeVDOP(stationLocations,edges,altitude,base_station,isCircle,latitudePrecision,longitudePrecision,polygonOfInterest,currentLatitude){
    let currentLongitude= edges.get('min_longitude');
    let locataionArrayArray = [];
    let VDOPArray=[]
    while (currentLongitude < edges.get('max_longitude')){
        if (checkIfPointInsidePolygon(currentLatitude, currentLongitude, isCircle,polygonOfInterest)) {
            var locationArray = getPixelLocationArray(currentLatitude, currentLongitude, latitudePrecision, longitudePrecision);
            var VDOP = computeColorBasedOnVDOP(currentLatitude, currentLongitude, altitude, base_station, stationLocations);
            //let color = getColor(VDOP)
            locataionArrayArray.push(locationArray);
            VDOPArray.push(VDOP);
        }
        currentLongitude += longitudePrecision;
    }
    win.webContents.send("fromMain", ['VDOP',locataionArrayArray,VDOPArray]);
    currentLatitude += latitudePrecision;


    if (currentLatitude<edges.get('max_latitude')&&(!stopFlag)) setTimeout(function() {
        computeVDOP(stationLocations, edges, altitude, base_station, isCircle, latitudePrecision, longitudePrecision, polygonOfInterest, currentLatitude);
    },4);
    else {
        console.log(Date.now(),'liczeni VDOP');
        win.webContents.send("fromMain", ['VDOPend']);
    }
}
function getColor(val){
    var value = val*4;
    var bins = 60;
    if (value>(bins*2+1)) {return 'black';}
    var min = "00FF00";
    var half = "0000FF";
    var max = "FF0000";
    value= Math.floor(value);
    if (value >bins){
        value-=bins;
        value--;
        var tmp = generateColor(max,half,bins);
        return '#'+tmp[value];
    } else{
        value--;
        var tmp = generateColor(half,min,bins);

        return '#'+tmp[value];
    }
}
function checkIfPointInsidePolygon(latitude, longitude, isCircle,polygonOfInterest){
    if (isCircle){
        const meter_per_lat = 111320;
        const meter_per_lon = 40075000*Math.cos(3.14*latitude/180)/360;
        let x = (polygonOfInterest.get('lat')-latitude)*meter_per_lat;
        let y = (polygonOfInterest.get('lon')-longitude)*meter_per_lon;
        return polygonOfInterest.get('radius')>Math.sqrt(x**2+y**2);
    }
    var numberOfIntersections=0;
    for (var i=1;i<polygonOfInterest.length;++i){
        var maxY = Math.max(polygonOfInterest[i-1].get('lon'),polygonOfInterest[i].get('lon'))
        var minY = Math.min(polygonOfInterest[i-1].get('lon'),polygonOfInterest[i].get('lon'))
        if ((longitude>minY)&&(longitude<maxY)){

            var firstPartOfLine = Math.abs(polygonOfInterest[i-1].get('lon')-longitude)
            var secondPartOfLine = Math.abs(polygonOfInterest[i].get('lon')-longitude)
            var division = firstPartOfLine/(firstPartOfLine+secondPartOfLine);
            var xPoint = polygonOfInterest[i-1].get('lat')+division*(polygonOfInterest[i].get('lat')- polygonOfInterest[i-1].get('lat'));
            if (xPoint<latitude) numberOfIntersections++;
        }
    }
    var maxY = Math.max(polygonOfInterest[i-1].get('lon'),polygonOfInterest[0].get('lon'))
    var minY = Math.min(polygonOfInterest[i-1].get('lon'),polygonOfInterest[0].get('lon'))
    if ((longitude>minY)&&(longitude<maxY)){

        var firstPartOfLine = Math.abs(polygonOfInterest[i-1].get('lon')-longitude)
        var secondPartOfLine = Math.abs(polygonOfInterest[0].get('lon')-longitude)
        var division = firstPartOfLine/(firstPartOfLine+secondPartOfLine);
        var xPoint = polygonOfInterest[i-1].get('lat')+division*(polygonOfInterest[0].get('lat')- polygonOfInterest[i-1].get('lat'));
        if (xPoint<latitude) numberOfIntersections++;
    }
    return numberOfIntersections%2===1;
}

function getPixelLocationArray(latitude, longitude, latitudePrecision, longitudePrecision){
    var locationsArray=[]
    locationsArray.push([latitude-0.5*latitudePrecision,longitude-0.5*longitudePrecision]);
    locationsArray.push([latitude+0.5*latitudePrecision,longitude-0.5*longitudePrecision]);
    locationsArray.push([latitude+0.5*latitudePrecision,longitude+0.5*longitudePrecision]);
    locationsArray.push([latitude-0.5*latitudePrecision,longitude+0.5*longitudePrecision]);
    return locationsArray;
}

function computeColorBasedOnVDOP(currentLatitude, currentLongitude, altitude, base_station, stationLocations){
    var position = [0,0,0];
    var anchors=[];
    for (var i=0;i<stationLocations.length;++i){
        anchors.push(_geodetic2enu(stationLocations[i][0],stationLocations[i][1],0,currentLatitude,currentLongitude,altitude));
    }
    var VDOP = _computeSingleVDOP(anchors,position,base_station);
    return VDOP

}

function _computeSingleVDOP(anchors,position,base){
    var new_bases;
    if (base===-1){
        new_bases = [];
        for (let i=0;i<anchors.length;i++){
            new_bases.push(i);
        }
    } else {new_bases = [base];}
    var minVDOP = Number.MAX_VALUE;
    for (let i=0;i<new_bases.length;i++) {
        var helper = JSON.parse(JSON.stringify(anchors[new_bases[i]]));
        anchors[new_bases[i]]=JSON.parse(JSON.stringify(anchors[0]));
        anchors[0]=helper;
        var Jacobian = _computeJacobian2dot5D(anchors, position);
        var Q = _compute_Q(anchors.length - 1);
        try {
            var transposed_Jacobian = math.transpose(Jacobian);
            var equation = math.multiply(transposed_Jacobian, Jacobian);
            equation = math.inv(equation);
            equation = math.multiply(equation, transposed_Jacobian);
            equation = math.multiply(equation, Q);
            equation = math.multiply(equation, Jacobian);
            equation = math.multiply(equation, math.inv(math.multiply(transposed_Jacobian, Jacobian)));
            let out = Math.sqrt(equation._data[0][0] + equation._data[1][1]);
            if (out < minVDOP) minVDOP = out;

        }
        catch (e) {
        }
    }
    return minVDOP;
}

// Algebra

function _compute_Q(size){
    return math.add(math.identity(size),math.ones(size,size));
}

function _create_array2D(size1,size2){
    var arr=[];
    for (var i=0;i<size1;++i){
        var arrHelper=[];
        for (var j=0;j<size2;++j){
            arrHelper.push(0);

        }
        arr.push(arrHelper);
    }
    return arr;
}

function _computeJacobian2dot5D(anchors,position){

    var jacobian = _create_array2D(anchors.length-1,2);

    var distToReference = math.norm(math.subtract(position,math.subset(anchors,math.index(0, [0, 1,2]))[0]));

    var refence_derievative = math.multiply(math.subtract(math.subset(position,math.index([0, 1])),
        math.subset(anchors,math.index(0, [0, 1]))[0]),1/distToReference);

    for (var i=0;i<(anchors.length-1);++i){
        var distToCurrent = math.norm(math.subtract(position,math.subset(anchors,math.index(i+1, [0, 1,2]))[0]));
        var gradient = math.multiply(math.subtract(math.subset(position,math.index([0, 1])),
            math.subset(anchors,math.index(i+1, [0, 1]))[0]),1/distToCurrent);
        jacobian[i][0]=gradient[0]-refence_derievative[0];
        jacobian[i][1]=gradient[1]-refence_derievative[1];
    }
    return jacobian;
}

// Geodetic

function _geodetic2enu(lat, lon, h, lat0, lon0, h0) {
    var [x1, y1, z1] = _geodetic2ecef(lat, lon, h);
    var [x2, y2, z2] = _geodetic2ecef(lat0, lon0, h0);
    var [east, north, up] = _uvw2enu(x1 - x2, y1 - y2, z1 - z2, lat0, lon0);
    return [east, north, up];
}

function _geodetic2ecef(latitude,longitude,alt){
    if (Math.abs(latitude)>90) return [null,null,null];
    var latitudeRadians = _degrees_to_radians(latitude);
    var longitudeRadians = _degrees_to_radians(longitude);
    // radius of curvature of the prime vertical section
    var N = _semimajor_axis ** 2 / Math.sqrt(
        _semimajor_axis ** 2 * Math.cos(latitudeRadians) ** 2 + _semiminor_axis ** 2 * Math.sin(latitudeRadians) ** 2
    );
    // Compute cartesian (geocentric) coordinates given  (curvilinear) geodetic
    // coordinates.
    var x = (N + alt) * Math.cos(latitudeRadians) * Math.cos(longitudeRadians);
    var y = (N + alt) * Math.cos(latitudeRadians) * Math.sin(longitudeRadians);
    var z = (N * (_semiminor_axis / _semimajor_axis) ** 2 + alt) * Math.sin(latitudeRadians)
    return [x,y,z];
}

function _uvw2enu(u, v, w, lat0, lon0){
    if (Math.abs(lat0)>90) return [null,null,null];
    lat0 = _degrees_to_radians(lat0);
    lon0 = _degrees_to_radians(lon0);
    var t = Math.cos(lon0) * u + Math.sin(lon0) * v;
    var East = -Math.sin(lon0) * u + Math.cos(lon0) * v;
    var Up = Math.cos(lat0) * t + Math.sin(lat0) * w
    var North = -Math.sin(lat0) * t + Math.cos(lat0) * w
    return [East,North,Up];
}

function _degrees_to_radians(degrees)
{
    var pi = Math.PI;
    return degrees * (pi/180);
}

// Colors

function hex (c) {
    var s = "0123456789abcdef";
    var i = parseInt (c);
    if (i == 0 || isNaN (c))
        return "00";
    i = Math.round (Math.min (Math.max (0, i), 255));
    return s.charAt ((i - i % 16) / 16) + s.charAt (i % 16);
}

/* Convert an RGB triplet to a hex string */
function convertToHex (rgb) {
    return hex(rgb[0]) + hex(rgb[1]) + hex(rgb[2]);
}

/* Remove '#' in color hex string */
function trim (s) { return (s.charAt(0) == '#') ? s.substring(1, 7) : s }

/* Convert a hex string to an RGB triplet */
function convertToRGB (hex) {
    var color = [];
    color[0] = parseInt ((trim(hex)).substring (0, 2), 16);
    color[1] = parseInt ((trim(hex)).substring (2, 4), 16);
    color[2] = parseInt ((trim(hex)).substring (4, 6), 16);
    return color;
}

function generateColor(colorStart,colorEnd,colorCount){

    // The beginning of your gradient
    var start = convertToRGB (colorStart);

    // The end of your gradient
    var end   = convertToRGB (colorEnd);

    // The number of colors to compute
    var len = colorCount;

    //Alpha blending amount
    var alpha = 0.0;

    var saida = [];

    for (var i = 0; i < len; i++) {
        var c = [];
        alpha += (1.0/len);

        c[0] = start[0] * alpha + (1 - alpha) * end[0];
        c[1] = start[1] * alpha + (1 - alpha) * end[1];
        c[2] = start[2] * alpha + (1 - alpha) * end[2];

        saida.push(convertToHex (c));

    }

    return saida;

}

// Saving/Loading files

function openFile(){
    if (process.platform !== 'darwin') {
        // Resolves to a Promise<Object>
        dialog.showOpenDialog({
            title: 'Select the File to be uploaded',
            defaultPath: path.join(__dirname, '../assets/'),
            buttonLabel: 'Upload',
            // Restricting the user to only Text Files.
            filters: [
                {
                    extensions: ['mlat']
                }, ],
            // Specifying the File Selector Property
            properties: ['openFile']
        }).then(file => {
            // Stating whether dialog operation was
            // cancelled or not.
            console.log(file.canceled);
            if (!file.canceled) {
                // Updating the GLOBAL filepath variable
                // to user-selected file.
                //win.webContents.send("fromMain", ['load',file.filePaths[0].toString()]);
                savePath = file.filePaths[0];
                fs.readFile(file.filePaths[0], 'utf8', (err, data) => {
                    // Do something with file contents
                    //for (let i=0;i<3;++i) data[i]+=data[i];
                    // Send result back to renderer process
                    if (err!=null) {
                        win.webContents.send("fromMain", ['error']);
                        return null;

                    }
                    win.webContents.send("fromMain", ['load',data]);


                });
            }
        }).catch(err => {
            console.log(err)
        });
    }
    else {
        // If the platform is 'darwin' (macOS)
        dialog.showOpenDialog({
            title: 'Select the File to be uploaded',
            defaultPath: path.join(__dirname, '../assets/'),
            buttonLabel: 'Upload',
            filters: [
                {
                    extensions: ['mlat']
                }, ],
            // Specifying the File Selector and Directory
            // Selector Property In macOS
            properties: ['openFile', 'openDirectory']
        }).then(file => {
            console.log(file.canceled);
            if (!file.canceled) {
                // Updating the GLOBAL filepath variable
                // to user-selected file.
                //win.webContents.send("fromMain", ['load',file.filePaths[0].toString()]);
                fs.readFile(file.filePaths[0], 'utf8', (err, data) => {
                    // Do something with file contents
                    //for (let i=0;i<3;++i) data[i]+=data[i];
                    // Send result back to renderer process
                    if (err!=null) {
                        win.webContents.send("fromMain", ['error']);
                        return null;

                    }
                    win.webContents.send("fromMain", ['load',data]);


                });
            }
        }).catch(err => {
            console.log(err)
        });
    }
}

function saveWithPath(){
    if (savePath==null){
        saveAs(true);
    } else{
        win.webContents.send("fromMain", ['save',savePath]);
    }

}

function saveAs(ifChangeSavePath){
    dialog.showSaveDialog({
        title: 'Select the File Path to save',
        defaultPath: path.join(__dirname, '../assets/sample.mlat'),
        buttonLabel: 'Save',
        filters: [
            {
                extensions: ['mlat']
            }, ],
        properties: []
    }).then(file => {
        console.log(file.canceled);
        if (!file.canceled) {
            console.log(file.filePath.toString());
            if (ifChangeSavePath) savePath = file.filePath.toString();
            win.webContents.send("fromMain", ['save',file.filePath.toString()]);
        }
    }).catch(err => {
        console.log(err)
    });
}

var serverHelper = Express();

serverHelper.use(BodyParser.json());
serverHelper.use(BodyParser.urlencoded({ extended: true }));
serverHelper.use(Cors());

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