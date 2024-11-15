const { app, BrowserWindow,ipcMain,Menu,MenuItem ,dialog} = require('electron')
const path = require("path");
const fs = require("fs");
const math = require("mathjs");
const axios = require('axios')



let pass ='';
let passFlag=false;
// Constant for HDOP calculation
const _semimajor_axis = 6378137.0;
const _semiminor_axis = 6356752.31424518

let win; // mian window
let winHelper; // Window with help file (currently shows licence
let winSecurity; // window for login
let savePath =null; //Savepath defines an opened file. If user choose save, the opened file is overwritten

const homeDir = app.getPath('home'); // Directories used to choose starting location for save and load
const desktopDir = path.resolve(homeDir, 'Desktop');

//
const template = [ // Information about top menu
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
              label: 'Save examples',
              accelerator: 'Ctrl+e',
              click(){
                  saveExamples(false);
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
    }
]

const menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)

let stopFlag; //This flag is used to stop current program. It is changed by a renderer process. Once it is set, the main process exit  current process

function createWindow (isNotMain,name) { // Function used to create a window
    /*
    bool isNotMain
    string name
    This function creates window depending on the args. isNotMain was added so when function which adds even is used, event can be first arg (in
    this case isNotMain is true)
     */
    if (!isNotMain) { // Create main window
        win = new BrowserWindow({
            width: 1200,
            minWidth:650,
            height: 800,
            title: "MLAT Analyzer",
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
        win.webContents.send("fromMain", ['gotKey']);
        win.on('closed', (e) => {
            app.quit();
        })
    } else{ // Create helepr window or security window
        if (name=='helper'){
            winHelper = new BrowserWindow({
                width: 1200,
                height: 800,
                title: "Help",
            })
            winHelper.loadFile('LICENSES.chromium.html');
            winHelper.setMenu(null);
        } else if (name=='security'){
            winSecurity = new BrowserWindow({
                width: 1200,
                height: 800,
                title: "Pass",
                frame: false,
                webPreferences: {
                    nodeIntegration: true,
                    preload: path.join(__dirname, "preload.js")
                }
            })
            winSecurity.loadFile('yubiAnimation.html'); //Load html with animation
            ipcMain.on('request-update-label-in-second-window', (event, arg) => {
                win.webContents.send('action-update-label', arg);
            });
            winSecurity.setMenu(null);
            winSecurity.webContents.on("before-input-event", (event, input) => { //event for clicking a key on the keyboard
                //process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0; // For debuging, delete later
                if (passFlag) if (input.type=='keyDown') {
                    //winSecurity.webContents.openDevTools()
                    if (input.key=='Enter'){
                        winSecurity.webContents.send("fromMain", ['start',pass.length]);
                        let helper = pass.slice(pass.length-44);
                        axios.get( // Check if key is fine on the yubico website
                            'https://api.yubico.com/wsapi/2.0/verify?otp='+helper+'&id=63231&timeout=8&sl=50&nonce=askjdnkajsndjkasndkjsnad').then(resp => {
                            //if (resp.data.indexOf('status=OK')!=-1){ // Check if status of key is fine
                            if (true) { // for debugging
                                axios.post('http://serwer1717148.home.pl/licenses/key_checker.php', { //Check if key is our.
                                    password: helper
                                })
                                    .then(res => {
                                        let ifCorrectPass=(res.data===true);
                                        pass = '';
                                        if (ifCorrectPass) {
                                            passFlag = false;
                                            win.webContents.send("fromMain", ['gotKey']);
                                            winSecurity.close();

                                        } else{
                                            winSecurity.webContents.send("fromMain", ['wrongKey','You used a key which does not belong to Aerobits.']);
                                        }
                                    })
                                    .catch(error => {

                                        passFlag = false;
                                            win.webContents.send("fromMain", ['gotKey']);
                                        winSecurity.close();
                                    })
                            } else{
                                winSecurity.webContents.send("fromMain", ['wrongKey','You used the wrong key.']);
                            }

                        }).catch(error => {
                                console.log(error);
                                winSecurity.webContents.send("fromMain", ['wrongKey','There was a problem with the connection to YubiCloud']);
                            })
                    } else if(input.key=='Escape'){
                        app.quit()
                    } else {
                        pass+=input.key;
                        //console.log(input.key)

                    }
                }
            });
        }
    }
}

app.whenReady().then(createWindow) // Create window when app is ready
ipcMain.on("toMain", (event, args) => {
    //Channel for communication with renderer processes. First argument choose what kind of action is made, the rest arguments are in function
    if (args[0]=='load') {
        /*
            arg[1] -> string directory
            This function read data from the file selected by directory and return them to rendered process
         */
        fs.readFile(args[1], 'utf8', (err, data) => {
            if (err!=null) {
                win.webContents.send("fromMain", ['error']);
                return null;
            }
            win.webContents.send("fromMain", ['load',data]);
        });
    } else if (args[0]=='save'){
        /*
           arg[1] -> string directory
           arg[2] -> string data
           This function gets data and save them in the file
        */
        fs.writeFile(args[1],args[2], (err) => {
           if (err!=null) {
               win.webContents.send("fromMain", ['error']);
               return null;
           }
        });
    } else if (args[0]=='exit'){
        /*
            This function close the application
         */
        app.quit()
    } else if (args[0]=='HDOP'){
        /*
            arg[1] -> flat[?][3] stationLocations
           arg[2] -> Map (with keys min_longitude->float and max_longitude) edges
           arg[3] -> float altitude
           arg[4] -> int base_station
           arg[5] -> bool isCircle
           arg[6] -> float latitudePrecision
           arg[7] -> float longitudePrecision
           arg[8] -> type8 polygonOfInterest -> this variable has different type depending on the value of isCircle
           if isCricle:
                type8 -> map (with keys 'lon'->float, 'lat'->float and 'radius'->float)
           otherwise:
                type8 -> map[] (with keys 'lon'->float and 'lat'->float)
            This function start recursive asynchronous function which computes values of HDOP and regularly sends them to renderer process
         */
        let currentLatitude= args[2].get('min_latitude');
        stopFlag=false;
        computeHDOP(args[1],args[2],args[3],args[4],args[5],args[6],args[7],args[8],currentLatitude)


    } else if  (args[0]=='Stop'){
        /*
            This function is used to stop recursive computeHDOP function.
         */
        stopFlag=true;
    } else if  (args[0]=='clearSavePath'){
        /*
            Clear typical savePath
         */
        savePath =null;
    }else if  (args[0]=='setMenu'){
        /*
            Set top menu, run once the map is loaded
         */
        win.setMenu(menu);
    }else if (args[0]== 'firstRun'){
        /*
            If first run, ask user to save examples
         */
        saveExamples(true);
    }else if (args[0]== 'checkKey'){
        /*
            This function shows security window
         */
        //passFlag = true;
        //createWindow(true,'security');
    }

});


function saveExamples(checkIfFirstRun){
    /*
        bool checkIfFirstRun
        This function ask user to save examples. If checkIfFirstRun is true, the function will firslty check if this is first run of app.
        If it is not, it does nothing
     */
    const firstTimeFilePath = path.resolve(app.getPath('userData'), '.first-time-huh'); // Open standard path
    try {
        if (checkIfFirstRun) fs.closeSync(fs.openSync(firstTimeFilePath, 'wx')); // IF we want to check if this app was already runned, we check if this file exist. If it exist, app will be unable to overwrite it and move to catch
        dialog.showOpenDialog({
            title: 'It is the first run of this application. Do you want to save examples to chekc what can be done?',
            defaultPath: desktopDir,
            buttonLabel: 'Save example',
            properties: ['openDirectory']
        }).then(file => {
            if (!file.canceled) {
                fs.mkdir(path.join(file.filePaths[0].toString(), 'Examples of MLAT'), (err)=>{
                    //console.log(err);
                    win.webContents.send("fromMain", ['firstRun',path.resolve( file.filePaths[0].toString(),'Examples of MLAT','ex1.mlat'),path.resolve( file.filePaths[0].toString(),'Examples of MLAT','ex2.mlat')]);
                })
            }
        }).catch(err => {
            console.log(err)
        });
    } catch(e) {
        if (e.code != 'EEXIST') throw e;

    }
}

app.on('window-all-closed', () => { //If all windows closed, close app (for MAcOs)
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
app.on('activate', () => { //If app is activated, create standard window
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(true,'helper')
  }
})

// Computing HDOP

function computeHDOP(stationLocations,edges,altitude,base_station,isCircle,latitudePrecision,longitudePrecision,polygonOfInterest,currentLatitude){
    /*
           flat[?][3] stationLocations
           Map (with keys min_longitude->float and max_longitude) edges
           float altitude
           int base_station
           bool isCircle
           float latitudePrecision
           float longitudePrecision
           type8 polygonOfInterest -> this variable has different type depending on the value of isCircle
           if isCricle:
                type8 -> map (with keys 'lon'->float, 'lat'->float and 'radius'->float)
           otherwise:
                type8 -> map[] (with keys 'lon'->float and 'lat'->float)
            This function is recursive asynchronous function which computes values of HDOP and regularly sends them to renderer process.
            If it is last instance, it also sends that process is finished
     */
    let currentLongitude= edges.get('min_longitude');
    let locataionArrayArray = []; // Array of array of locations. Each array contains information of one pixel
    let HDOPArray=[] //Array which contains bvalues of HDOP for locationas
    while (currentLongitude < edges.get('max_longitude')){ //Iterate until all longs are saved
        if (checkIfPointInsidePolygon(currentLatitude, currentLongitude, isCircle,polygonOfInterest)) {
            var locationArray = getPixelLocationArray(currentLatitude, currentLongitude, latitudePrecision, longitudePrecision);// set information about pixel
            var HDOP = computeSingleHDOP(currentLatitude, currentLongitude, altitude, base_station, stationLocations);
            locataionArrayArray.push(locationArray);
            HDOPArray.push(HDOP);
        }
        currentLongitude += longitudePrecision;
    }


    win.webContents.send("fromMain", ['HDOP',locataionArrayArray,HDOPArray]); //Send information to renderer process
    currentLatitude += latitudePrecision;
    if (currentLatitude<edges.get('max_latitude')&&(!stopFlag)) setTimeout(function() {
        computeHDOP(stationLocations, edges, altitude, base_station, isCircle, latitudePrecision, longitudePrecision, polygonOfInterest, currentLatitude);
    },4);
    else {
        //console.log(Date.now(),'liczeni HDOP');
        win.webContents.send("fromMain", ['HDOPend']);
    }
}

function checkIfPointInsidePolygon(latitude, longitude, isCircle,polygonOfInterest){
    /*
        float latitude,
        float longitude,
        bool isCircle
        type4 polygonOfInterest,
        if isCricle:
                type8 -> map (with keys 'lon'->float, 'lat'->float and 'radius'->float)
           otherwise:
                type8 -> map[] (with keys 'lon'->float and 'lat'->float)
         return bool
         This function check if place is inside polygon of polygonOfInterest
     */
    if (isCircle){ // If cirlce, distance to center is checked to check if point is inside polygon
        const meter_per_lat = 111320;
        const meter_per_lon = 40075000*Math.cos(3.14*latitude/180)/360;
        let x = (polygonOfInterest.get('lat')-latitude)*meter_per_lat;
        let y = (polygonOfInterest.get('lon')-longitude)*meter_per_lon;
        return polygonOfInterest.get('radius')>Math.sqrt(x**2+y**2);
    }
    var numberOfIntersections=0;//Checks if point is inside polygon with this algorithm  https://en.wikipedia.org/wiki/Point_in_polygon
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
    var maxY = Math.max(polygonOfInterest[i-1].get('lon'),polygonOfInterest[0].get('lon')) // Compute once again for first and last vertex
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
    /*
        float latitude,
        float longitude,
        float latitudePrecision,
        float longitudePrecision,
        return float[4]
        //This function return vertexes of pixel based on its center(latitude and longitude) and precision
     */
    var locationsArray=[]
    locationsArray.push([latitude-0.5*latitudePrecision,longitude-0.5*longitudePrecision]);
    locationsArray.push([latitude+0.5*latitudePrecision,longitude-0.5*longitudePrecision]);
    locationsArray.push([latitude+0.5*latitudePrecision,longitude+0.5*longitudePrecision]);
    locationsArray.push([latitude-0.5*latitudePrecision,longitude+0.5*longitudePrecision]);
    return locationsArray;
}

function computeSingleHDOP(currentLatitude, currentLongitude, altitude, base_station, stationLocations){
    /*
        float currentLatitude,
        float currentLongitude,
        float altitude,
        int base_station,
        float[?][i] stationLocations (in GEO coordinate system)
        return float
        This function transfers geo coordinate system to ENU coordinate system, then it uses _computeSingleHDOP to
        compute value of HDOP
     */
    var position = [0,0,0];
    var anchors=[];
    for (var i=0;i<stationLocations.length;++i){
        anchors.push(_geodetic2enu(stationLocations[i][0],stationLocations[i][1],0,currentLatitude,currentLongitude,altitude));
    }
    return _computeSingleHDOP(anchors,position,base_station,'TDOA');
}

function _computeSingleHDOP(anchors,position,base,methodHDOP){
    /*
        float[?][3] anchors (in ENU)
        float [3] position (in ENU)
        int base
        string TDOA'
        return float
        This function computes HDOP value for chosen position for chosen method.

        There are 3 possible methods: for time difference of arrvial (TDOA), for time of arrival with unknown time sending
        (TOA), and TOA with addational estimation of time (TOAQuery)
     */
    var new_bases;
    if (base===-1){ // -1 means that user wants to check value for all possible bases and chow the best one
        new_bases = [];
        for (let i=0;i<anchors.length;i++){
            new_bases.push(i);
        }
    } else {new_bases = [base];}
    var minHDOP = Number.MAX_VALUE;
    for (let i=0;i<new_bases.length;i++) { // Compute HDOP based on equation expained in doc
        var helper = JSON.parse(JSON.stringify(anchors[new_bases[i]]));
        anchors[new_bases[i]]=JSON.parse(JSON.stringify(anchors[0]));
        anchors[0]=helper;
        if (methodHDOP=='TDOA'){
            var Jacobian = _computeJacobian2dot5DTDOA(anchors, position);
            var Q = _compute_Q(anchors.length-1);
        }else if (methodHDOP=='TOA'){
            var Jacobian = _computeJacobian2dot5DTOA(anchors, position);
            var Q = math.identity(anchors.length)
        } else if (methodHDOP=='TOAQuery'){
            var Jacobian = _computeJacobian2dot5DResponse(anchors, position);
            var Q = math.identity(anchors.length)
        }

        try {
            var transposed_Jacobian = math.transpose(Jacobian);
            var equation = math.multiply(transposed_Jacobian, Jacobian);
            equation = math.inv(equation);
            equation = math.multiply(equation, transposed_Jacobian);
            equation = math.multiply(equation, Q);
            equation = math.multiply(equation, Jacobian);
            equation = math.multiply(equation, math.inv(math.multiply(transposed_Jacobian, Jacobian)));
            let out = Math.sqrt(equation._data[0][0] + equation._data[1][1]);
            if (out < minHDOP) minHDOP = out;

        }
        catch (e) {
            app.quit()
        }
    }
    return minHDOP;
}

// Algebra

function _compute_Q(size){
    /*
        int size
        return matrix size x size
        This function computes a Q matrix which is used to compute HDOP
     */
    return math.add(math.identity(size),math.ones(size,size));
}

function _create_array2D(size1,size2){
    /*
        int size1
        int size2
        return array[size1][size2]
        This function computes array full of zeros
     */
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

function _computeJacobian2dot5DResponse(anchors,position){
    /*
        float [?][3] anchors (in ENU)
        float position [3] (in ENU)
        return float [?][2]
        This function computes Jacobian for TOAQuery method with know altitude
     */
    var jacobian = _create_array2D(anchors.length,2);
    for (var i=0;i<(anchors.length);++i){
        var distToCurrent = math.norm(math.subtract(position,math.subset(anchors,math.index(i, [0, 1,2]))[0]));
        var gradient = math.multiply(math.subtract(math.subset(position,math.index([0, 1])),
            math.subset(anchors,math.index(i, [0, 1]))[0]),1/distToCurrent);
        jacobian[i][0]=gradient[0];
        jacobian[i][1]=gradient[1];
    }
    return jacobian;
}

function _computeJacobian2dot5DTOA(anchors,position){
    /*
        float [?][3] anchors (in ENU)
        float position [3] (in ENU)
        return float [?][2]
        This function computes Jacobian for TOA method with know altitude
     */
    var jacobian = _create_array2D(anchors.length,3);
    for (var i=0;i<(anchors.length);++i){
        var distToCurrent = math.norm(math.subtract(position,math.subset(anchors,math.index(i, [0, 1,2]))[0]));
        var gradient = math.multiply(math.subtract(math.subset(position,math.index([0, 1])),
            math.subset(anchors,math.index(i, [0, 1]))[0]),1/distToCurrent);
        jacobian[i][0]=gradient[0];
        jacobian[i][1]=gradient[1];
        jacobian[i][2]=1;
    }
    return jacobian;
}

function _computeJacobian2dot5DTDOA(anchors,position){
    /*
        float [?][3] anchors (in ENU)
        float position [3] (in ENU)
        return float [?][2]
        This function computes Jacobian for TDOA method with know altitude
     */
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

// Function for changing coordinates

function _geodetic2enu(lat, lon, h, lat0, lon0, h0) {
    /*
        float lat
        float lon
        float h
        float lat0
        float lon0
        float h0
        return float[3]
        This function computes position in ENU for [lat,lon,h] in respect to [lat0,lon0,h0]
     */
    var [x1, y1, z1] = _geodetic2ecef(lat, lon, h);
    var [x2, y2, z2] = _geodetic2ecef(lat0, lon0, h0);
    var [east, north, up] = _uvw2enu(x1 - x2, y1 - y2, z1 - z2, lat0, lon0);
    return [east, north, up];
}

function _geodetic2ecef(latitude,longitude,alt){
    /*
        float latitude
        float longitude
        float alt
        return float[3]
        This function translates position in GEO to ECEF coordinate system
     */
    if (Math.abs(latitude)>90) return [null,null,null];
    var latitudeRadians = _degrees_to_radians(latitude);
    var longitudeRadians = _degrees_to_radians(longitude);
    // radius of curvature of the prime vertical section
    var N = _semimajor_axis ** 2 / Math.sqrt(
        _semimajor_axis ** 2 * Math.cos(latitudeRadians) ** 2 + _semiminor_axis ** 2 * Math.sin(latitudeRadians) ** 2
    );

    var x = (N + alt) * Math.cos(latitudeRadians) * Math.cos(longitudeRadians);
    var y = (N + alt) * Math.cos(latitudeRadians) * Math.sin(longitudeRadians);
    var z = (N * (_semiminor_axis / _semimajor_axis) ** 2 + alt) * Math.sin(latitudeRadians)
    return [x,y,z];
}

function _uvw2enu(u, v, w, lat0, lon0){
    /*
        float u
        float v
        float w
        float lat0
        float lon0
        return float[3]
        This function translates position in GEO to UVW coordinate system
     */
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
    /*
        float degrees
        return float
        This function computes value of raiands based on degrees
     */
    var pi = Math.PI;
    return degrees * (pi/180);
}

// Colors

function hex (c) {
    /*
        int c
        return string[2]
        This function return int saved in hex as tring
     */
    var s = "0123456789abcdef";
    var i = parseInt (c);
    if (i == 0 || isNaN (c))
        return "00";
    i = Math.round (Math.min (Math.max (0, i), 255));
    return s.charAt ((i - i % 16) / 16) + s.charAt (i % 16);
}


function convertToHex (rgb) {
    /*
        int rgb
        return string[2]
        Convert an RGB triplet to a hex string
     */
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

// Saving/Loading files

function openFile(){
    if (process.platform !== 'darwin') {
        // Resolves to a Promise<Object>
        dialog.showOpenDialog({
            title: 'Select the File to be uploaded',
            defaultPath: desktopDir,
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
            defaultPath: desktopDir,
            buttonLabel: 'Upload',
            filters: [
                {
                    extensions: ['mlat']
                }, ],
            // Specifying the File Selector and Directory
            // Selector Property In macOS
            properties: ['openFile', 'openDirectory']
        }).then(file => {
            if (!file.canceled) {
                // Updating the GLOBAL filepath variable
                // to user-selected file.
                fs.readFile(file.filePaths[0], 'utf8', (err, data) => {

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
    /*
        This function is used when user click 'save' in the top menu. It saves file to previously used file. If there is no
        previously saved file, it will work as saveAs
     */
    if (savePath==null){
        saveAs(true);
    } else{
        win.webContents.send("fromMain", ['save',savePath]);
    }

}
function saveAs(ifChangeSavePath){
    /*
        bool ifChangeSavePath
        This function is used to save a file with path chosen with saveDialog. If flag is true,
        new path will be saved.
     */
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
        if (!file.canceled) {
            if (ifChangeSavePath) savePath = file.filePath.toString();
            win.webContents.send("fromMain", ['save',file.filePath.toString()]);
        }
    }).catch(err => {
        console.log(err)
    });
}
