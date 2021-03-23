const { app, BrowserWindow,ipcMain } = require('electron')
const path = require("path");
const fs = require("fs");
const math = require("mathjs")

const _semimajor_axis = 6378137.0;
const _semiminor_axis = 6356752.31424518

let win;

function createWindow () {
    win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Localization measurnment error - accuracy",
    webPreferences: {
      nodeIntegration: true,
      preload: path.join(__dirname, "preload.js")
    }



  })

    win.maximize();

  win.webContents.openDevTools()

  ipcMain.on('request-update-label-in-second-window', (event, arg) => {
    // Request to update the label in the renderer process of the second window
    win.webContents.send('action-update-label', arg);
  });

  win.loadFile('index.html');


}

app.whenReady().then(createWindow)


ipcMain.on("toMain", (event, args) => {
    //alert("The file has been succesfully saved");
    if (args[0]=='load') {
        fs.readFile(args[1], 'utf8', (err, data) => {
            // Do something with file contents
            //for (let i=0;i<3;++i) data[i]+=data[i];
            // Send result back to renderer process
            if (err!=null) {
                win.webContents.send("fromMain", ['error']);
                return null;

            }
            //var obj = JSON.parse('{ "name":"John", "age":30, "city":"New York"}');

            win.webContents.send("fromMain", ['load',data]);


        });
    } else if (args[0]=='save'){
        console.log(args[1],args[2])
        fs.writeFile(args[1],args[2], (err) => {
            console.log('save')
           if (err!=null) {
               console.log('saveerr')
                //alert("An error ocurred updating the file" + err.message);
               win.webContents.send("fromMain", ['error']);
               return null;

           }
            console.log('save')
        });
       // alert("The file has been succesfully saved");

    } else if (args[0]=='check'){
        fs.readdir('saves/', (err, files) => {
            if (err!=null){
                win.webContents.send("fromMain", ['error']);
                return null;
            }
            win.webContents.send("fromMain", ['check',files]);
        });
        // alert("The file has been succesfully saved");

    } else if (args[0]=='delete'){
        try {
            fs.unlinkSync(args[1])
            //file removed
        } catch(err) {
            win.webContents.send("fromMain", ['error']);
        }
    } else if (args[0]=='exit'){
        app.quit()
    } else if (args[0]=='test'){
        win.webContents.send("fromMain", ['test']);
    } else if (args[0]=='VDOP'){
        let stationLocations = args[1];
        let edges = args[2];
        let altitude = args[3];
        let base_station = args[4];
        let isCircle = args[5];
        let latitudePrecision = args[6];
        let longitudePrecision = args[7];
        let polygonOfInterest = args[8];
        let currentLatitude= edges.get('min_latitude');
        while (currentLatitude<edges.get('max_latitude')){
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
            var waitTill = new Date(new Date().getTime() + 100);
            while(waitTill > new Date()){}
            currentLatitude += latitudePrecision;
        }

    }

});


app.on('window-all-closed', () => {
  const fs = require('fs');
  try { fs.writeFileSync('myfile.txt', 'the text to write in the file', 'utf-8'); }
  catch(e) { alert('Failed to save the file !'); }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

function getColor(val){
    //console.log(value);
    var value = val*4;
    var bins = 60;
    if (value>(bins*2+1)) {return 'black';}
    var min = "00FF00";
    var half = "0000FF";
    var max = "FF0000";

    value= Math.floor(value);
    //console.log(value);

    if (value >bins){
        value-=bins;
        value--;

        var tmp = generateColor(max,half,bins);
        //console.log(tmp[value]);
        //throw 'kniec';
        return '#'+tmp[value];
    } else{
        value--;
        var tmp = generateColor(half,min,bins);
        //console.log(tmp[value]);
        //throw 'kniec';
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
    for (var i=1;i<locationArray.length;++i){
        var maxY = Math.max(polygonOfInterest[i-1].get('longitude'),polygonOfInterest[i].get('longitude'))
        var minY = Math.min(polygonOfInterest[i-1].get('longitude'),polygonOfInterest[i].get('longitude'))
        if ((longitude>minY)&&(longitude<maxY)){
            //console.log('---------');
            //console.log(longitude);
            //console.log(locationArray[i-1].longitude);
            //console.log(locationArray[i].longitude);
            var firstPartOfLine = Math.abs(polygonOfInterest[i-1].get('longitude')-longitude)
            var secondPartOfLine = Math.abs(polygonOfInterest[i].get('longitude')-longitude)
            var division = firstPartOfLine/(firstPartOfLine+secondPartOfLine);
            var xPoint = polygonOfInterest[i-1].get('latitude')+division*(polygonOfInterest[i].get('latitude')- polygonOfInterest[i-1].get('latitude'));
            if (xPoint<latitude) numberOfIntersections++;
        }
    }
    return numberOfIntersections%2===1;
}

function getPixelLocationArray(latitude, longitude, latitudePrecision, longitudePrecision){
    var locationsArray=[]
    locationsArray.push([latitude-0.5*latitudePrecision,longitude-0.5*longitudePrecision]);
    locationsArray.push([latitude+0.5*latitudePrecision,longitude-0.5*longitudePrecision]);
    locationsArray.push([latitude+0.5*latitudePrecision,longitude+0.5*longitudePrecision]);
    locationsArray.push([latitude-0.5*latitudePrecision,longitude+0.5*longitudePrecision]);
    //console.log(locationsArray);
    return locationsArray;
}

function computeColorBasedOnVDOP(currentLatitude, currentLongitude, altitude, base_station, stationLocations){
    var position = [0,0,0];
    var anchors=[];
    for (var i=0;i<stationLocations.length;++i){
        //throw 'Parameter is not a number!';
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

        //console.log(new_bases);
        //console.log(anchors);
        //throw 'koniec';
        //console.log(anchors);
        //console.log(position);
        var Jacobian = _computeJacobian2dot5D(anchors, position);
        //console.log(Jacobian);
        var Q = _compute_Q(anchors.length - 1);
        //console.log(Q,'Q');
        //try{
        //console.log(anchors)
        //console.log(position)
        try {
            var transposed_Jacobian = math.transpose(Jacobian);
            //console.log(JSON.parse(JSON.stringify(transposed_Jacobian)),'transposed_Jacobian');
            var equation = math.multiply(transposed_Jacobian, Jacobian);//np.dot(tran_J,J)
            //console.log(JSON.parse(JSON.stringify(equation)),'eq2');
            equation = math.inv(equation);//np.linalg.inv(equation)
            //console.log(JSON.parse(JSON.stringify(equation)),'eq3');
            equation = math.multiply(equation, transposed_Jacobian);//np.dot(equation,tran_J)
            //console.log(JSON.parse(JSON.stringify(equation)),'eq4');
            equation = math.multiply(equation, Q);//np.dot(equation, Q)
            //console.log(JSON.parse(JSON.stringify(equation)),'eq5');
            equation = math.multiply(equation, Jacobian);//np.dot(equation, J)
            //console.log(JSON.parse(JSON.stringify(equation)),'eq6');
            equation = math.multiply(equation, math.inv(math.multiply(transposed_Jacobian, Jacobian)));//np.dot(equation, np.linalg.inv(np.dot(tran_J,J)))
            //console.log(JSON.parse(JSON.stringify(equation)),'eq7');
            //throw "koniec";
            //equation = Math.sqrt(equation._data[0][0]+equation._data[1][1]);
            //console.log(JSON.parse(JSON.stringify(equation)),'eq7');
            //throw "koniec";
            let out = Math.sqrt(equation._data[0][0] + equation._data[1][1]);
            if (out < minVDOP) minVDOP = out;

        }
            //}
        catch (e) {
            //continue;
        }
    }
    return minVDOP;
}

function _compute_Q(size){
    return math.add(math.identity(size),math.ones(size,size));
}

function _create_array2D(size1,size2){
    var arr=[];
    //console.log(arr);
    //throw "koniec";
    //console.log('-------');
    for (var i=0;i<size1;++i){
        //console.log(arr);
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
    //console.log('-------');
    //console.log(anchors,'anchors');
    //console.log(jacobian);
    //console.log(position,'position');
    //console.log(math.subset(anchors,math.index(0, [0, 1,2])))
    //console.log(math.subtract(position,math.subset(anchors,math.index(0, [0, 1,2]))[0]))
    var distToReference = math.norm(math.subtract(position,math.subset(anchors,math.index(0, [0, 1,2]))[0]));
    //console.log(distToReference,'distToReference');
    //refence_derievative = (position[0:2] - anchors[-1][0:2]) / dist_to_refernce
    //console.log(math.subset(position,math.index([0, 1])));
    //console.log(math.subset(anchors,math.index(0, [0, 1]))[0]);
    var refence_derievative = math.multiply(math.subtract(math.subset(position,math.index([0, 1])),
        math.subset(anchors,math.index(0, [0, 1]))[0]),1/distToReference);
    //console.log(refence_derievative,'refence_derievative');
    //console.log(refence_derievative);
    for (var i=0;i<(anchors.length-1);++i){
        //console.log(i);

        var distToCurrent = math.norm(math.subtract(position,math.subset(anchors,math.index(i+1, [0, 1,2]))[0]));
        //console.log();
        //console.log()
        var gradient = math.multiply(math.subtract(math.subset(position,math.index([0, 1])),
            math.subset(anchors,math.index(i+1, [0, 1]))[0]),1/distToCurrent);
        //console.log(JSON.parse(JSON.stringify(distToCurrent)),'distToCurrent');
        //console.log(JSON.parse(JSON.stringify(gradient)),'gradient');
        jacobian[i][0]=gradient[0]-refence_derievative[0];
        jacobian[i][1]=gradient[1]-refence_derievative[1];
        //console.log(jacobian);
        //console.log(gradient);
        //throw "koniec";

    }
    //console.log(anchors,position);
    //console.log(jacobian);
    //throw "koniec";
    return jacobian;
}


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