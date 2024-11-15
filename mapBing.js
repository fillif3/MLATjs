/*
    This module is used to contol map Bing map.
     In the application, HDOP values and coorindation transformations are computed by the main process so those functions
     are currently unused but I left the if anyone wants to use this module outside of electron
 */
var mapModule = (function() {
    'use strict';

    const _semimajor_axis = 6378137.0;
    const _semiminor_axis = 6356752.31424518
    const _meter_per_lat = 111320;

    var _startTimeForDebugging=0;
    var _endTimeForDebugging=0;

    // Map varaiables
    var _MAP_REFERENCE = null;
    var _handlers = new Map();
    // Station variables
    var _stationArray =[];
    var _stationAltitudeArray=[];
    var _ifStationActive=[]
    // Polygon variables
    var _vertexArray=[];
    var _vertexPolygon = null;
    // HDOP varaibales (references)
    var _HDOPPixels = [];
    var _HDOPValues = [];
    // Circle variables
    var _circleRadius=0;
    var _circlePin=null;
    var _circlePolygon=null;
    // Variables connected to computing HDOP
    var _outputId='';
    var _edges=null;
    var _latitudePrecision = 0;
    var _longitudePrecision = 0;
    var _currentLatitude=0;
    var _currentLongitude = 0;
    var _step=0;
    var _clearFunction=null;
    var _blockFunction=null
    var _endHDOPComputation=false;

    // Getting variables

    function getCenter(){
        // return loc object -> https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-api/location-class
        return _MAP_REFERENCE.getCenter();
    }


    // Setting variables


    function setCenter(lat,lon){
        /*
            float lat
            float lon
            This function centers position of the map
         */
        _MAP_REFERENCE.setView({
            center: new Microsoft.Maps.Location(lat,lon)
        });
    }

    function setOutputId(val){
        // This function set where computed HDOP values should be placed
        _outputId=val;
    }


    // Setting functions

    function setBlockFunction(func){
        // the set function is used during computation of HDOP
        _blockFunction=func;
    }

    function setClearFunction(func){
        // the set function is called after calculation HDOP
        _clearFunction=func;
    }

    // Geometry transformations between coordiates - Start

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
        // Compute cartesian (geocentric) coordinates given  (curvilinear) geodetic
        // coordinates.
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

    function _geodetic2enu(lat, lon, h, lat0, lon0, h0){
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
        var [east,north,up] = _uvw2enu(x1-x2, y1-y2, z1-z2, lat0, lon0);
        return [east,north,up];
    }

    function _degrees_to_radians(degrees){
        /*
        float degrees
        return float
        This function computes value of raiands based on degrees
     */
        var pi = Math.PI;
        return degrees * (pi/180);
    }

    // Jacobian functions

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

    function _computeJacobian2dot5D(anchors,position){
        /*
        int size1
        int size2
        return array[size1][size2]
        This function computes array full of zeros
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

    // Computing HDOP
    function createPixelsFromData(pixelsLocations,values) {
        /*
            float[?][4][2] pixelsLocations,
            float[?] values
            This function is used to create pixels on the Bing map. Each pixel is a Polygon object
            https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-api/polygon-class with color based on value
            and each pixel calls _showHDOP when mouse is over pixel
         */
        for (let i=0;i<pixelsLocations.length;++i){
            try {
                let locs=[];
                for (var j=0;j<4;++j){
                    let loc = new Microsoft.Maps.Location(pixelsLocations[i][j][0], pixelsLocations[i][j][1]);
                    locs.push(loc);
                }
                let color = _getColor(values[i])
                let pixel = new Microsoft.Maps.Polygon(locs, {strokeThickness: 0, fillColor: color});
                Microsoft.Maps.Events.addHandler(pixel, "mouseover", function (e) {
                    _showHDOP(e);
                });
                _MAP_REFERENCE.entities.push(pixel);
                _HDOPPixels.push(pixel);
                _HDOPValues.push(values[i]);
            }
            catch (e){
            }
        }
    }

    function getHDOPPixels(){
        /*
            return polygon[] https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-api/polygon-class
         */
        return _HDOPPixels;
    }

    function getHDOPValues(){
        // return float[]
        return _HDOPValues;
    }

    function _computeSingleHDOP(anchors,position,base){
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
        if (base===-1){
            new_bases = [];
            for (let i=0;i<anchors.length;i++){
                new_bases.push(i);
            }
        } else {new_bases = [base];}
        var minHDOP = Number.MAX_VALUE;
        for (let i=0;i<new_bases.length;i++) {
            var helper = JSON.parse(JSON.stringify(anchors[new_bases[i]]));
            anchors[new_bases[i]]=JSON.parse(JSON.stringify(anchors[0]));
            anchors[0]=helper;
            var Jacobian = _computeJacobian2dot5D(anchors, position);
            var Q = _compute_Q(anchors.length - 1);
            try {
                var transposed_Jacobian = math.transpose(Jacobian);
                var equation = math.multiply(transposed_Jacobian, Jacobian);//np.dot(tran_J,J)
                equation = math.inv(equation);//np.linalg.inv(equation)
                equation = math.multiply(equation, transposed_Jacobian);//np.dot(equation,tran_J)
                equation = math.multiply(equation, Q);//np.dot(equation, Q)
                equation = math.multiply(equation, Jacobian);//np.dot(equation, J)
                equation = math.multiply(equation, math.inv(math.multiply(transposed_Jacobian, Jacobian)));//np.dot(equation, np.linalg.inv(np.dot(tran_J,J)))

                let out = Math.sqrt(equation._data[0][0] + equation._data[1][1]);
                if (out < minHDOP) minHDOP = out;
            }
            catch (e) {
            }
        }
        return minHDOP;
    }

    function _computeColorBasedOnHDOP(currentLatitude,currentLongitude,altitude,base_station,newStationArray){
        /*
        float currentLatitude,
        float currentLongitude,
        float altitude,
        int base_station,
        float[?][i] newStationArray (in GEO coordinate system)
        return float
        This function computes color of pixel based HDOP
     */
        var position = [0,0,0];
        var anchors=[];
        for (var i=0;i<newStationArray.length;++i){
            var loc = newStationArray[i].getLocation();
            anchors.push(_geodetic2enu(loc.latitude,loc.longitude,_stationAltitudeArray[i],currentLatitude,currentLongitude,altitude));
        }
        var HDOP = _computeSingleHDOP(anchors,position,base_station);
        _HDOPValues.push(HDOP);
        return _getColor(HDOP);
    }

    function _getPolygonOfInterest(isCircle){
        /*
            bool isCircle
            return Map or Map[]
            This function return a Map that descirpes circle or Map[] which descripes polygon
         */

        if (isCircle){
            let polygon = new Map();
            polygon.set('radius',_circleRadius);
            let loc = _circlePin.getLocation();
            polygon.set('lat',loc.latitude);
            polygon.set('lon',loc.longitude);
            return polygon
        } else{
            let polygon =[]
            for (let i=0;i<_vertexArray.length;++i){
                let loc = _vertexArray[i].getLocation();
                let vert = new Map();
                vert.set('lat',loc.latitude);
                vert.set('lon',loc.longitude);
                polygon.push(vert);
            }
            return polygon;

        }
    }

    function calculateHDOP(lat_res,lon_res,altitude,base_station,isCircle,timeout){
        /*
            float lat_res
            float lon_res
            float altitude
            int base_station
            bool isCircle
            float timeout
            This function firstly check if everything is fine with parameters. First two args decide about resolution
            i.e. how many pixels will be created. Then it calls function in the main process which computes set of HDOP
            value in fixed times
         */
        _startTimeForDebugging=performance.now();
        _endHDOPComputation=false;
        if ((_vertexArray.length<3)&&(!isCircle)) {
            alert('There is no polygon. You need more vertexes');
            return null;
        }
        if ((_circlePolygon==null)&&(isCircle)) {
            alert('There is no circle. You need to choose center of circle');
            return null;
        }
        let newStationArray = [];


        if (_ifStationActive!=null){
            for (var i=0;i<_ifStationActive.length;++i){
                if (_ifStationActive[i]) newStationArray.push(_stationArray[i]);
            }
        } else newStationArray = _stationArray;
        if (newStationArray.length<3) {
            alert('There are less then 3 active stations. You need at least 3 active stations to compute measurement errors');
            return null;
        }

        if ((lat_res*lon_res)>50000) if (!window.confirm("You typed high resolution. Are you sure? It can take some to finish")) return null;
        clearHDOP(); // Delete previos HDOP
        if (timeout ===4) _step = 30;
        else _step = 5;
        base_station--; //The user's input starts from one but indexing start from 0

        if (_blockFunction!=null) _blockFunction();
        _edges = _getPolygonEdgeValues(isCircle);
        let stationLocations=[]
        for (let i=0;i<newStationArray.length;i++){
            let loc = newStationArray[i].getLocation();
            stationLocations.push([loc.latitude,loc.longitude])
        }
        let polygonOfIntrest = _getPolygonOfInterest(isCircle);
        _latitudePrecision = (_edges.get('max_latitude') - _edges.get('min_latitude'))/lat_res;
        _longitudePrecision = (_edges.get('max_longitude') - _edges.get('min_longitude'))/lon_res;
        window.api.send("toMain", ['HDOP',stationLocations,_edges,altitude,base_station,isCircle,_latitudePrecision,
            _longitudePrecision,polygonOfIntrest]);
        _currentLatitude= _edges.get('min_latitude');
        if (_vertexPolygon!=null) _vertexPolygon.setOptions({visible:false});
        if (_circlePolygon!=null) _circlePolygon.setOptions({visible:false});
        return 0;
    }

    function calculateHDOPWithTimeOUT(newStationArray,altitude,base_station,isCircle,timeout){
        /*
            float[?][3] newStationArray -> in Geo
            float altitude
            int base_station
            bool isCircle
            float timeout
            This function is used to compute HDOP recursively with break so browser can update a map
         */
        for (let i=0;i<_step;++i) {
            _currentLongitude= _edges.get('min_longitude');
            while (_currentLongitude < _edges.get('max_longitude')) {
                if (_checkIfPointInsidePolygon(_currentLatitude, _currentLongitude, isCircle)) {
                    var locationArray = _getPixelLocationArray(_currentLatitude, _currentLongitude, _latitudePrecision, _longitudePrecision);
                    var color = _computeColorBasedOnHDOP(_currentLatitude, _currentLongitude, altitude, base_station, newStationArray);
                    var pixel = new Microsoft.Maps.Polygon(locationArray, {strokeThickness: 0, fillColor: color});
                    Microsoft.Maps.Events.addHandler(pixel, "mouseover", function (e) {
                        _showHDOP(e);
                    });
                    _MAP_REFERENCE.entities.push(pixel);
                    _HDOPPixels.push(pixel);
                }
                _currentLongitude += _longitudePrecision;
            }
            _currentLatitude += _latitudePrecision;
        }
        if ((_currentLatitude<_edges.get('max_latitude'))&&(!_endHDOPComputation)) {
            setTimeout(function() {
                calculateHDOPWithTimeOUT(newStationArray,altitude,base_station,isCircle);
            }, timeout)
        }
        else{ //Once all pixels are computed
            if (_vertexPolygon!=null) _vertexPolygon.setOptions({visible:false});
            if (_circlePolygon!=null) _circlePolygon.setOptions({visible:false});
            _endTimeForDebugging = performance.now();
            if (_clearFunction!=null) _clearFunction();
        }
    }

    function _showHDOP(e){ //This func is called when mouse hovfer pixel, it prints HDOP value to set input
        var pixel = e.target;
        for (var i=0;i<_HDOPPixels.length;++i){
            if (_HDOPPixels[i]===pixel){
                break;
            }
        }
        if (_outputId!=='') document.getElementById(_outputId).value = _HDOPValues[i].toString().slice(0,7);
        getLocalizationMeasurmentError();
    }

    function clearHDOP(){
        // This function clear all information about HDOP values and pixels
        for (var i=0;i<_HDOPPixels.length;++i){
            _MAP_REFERENCE.entities.remove(_HDOPPixels[i]);
            if (i%10==0) console.log(10)
        }
        _HDOPPixels=[];
        _HDOPValues=[];
    }



    function _getColor(val){
        /*
        float val
        return string[7]
        This function returns a hex string based on the HDOP vlaue
         */
        var value = val*4;
        var bins = 60;
        if (value>(bins*2+1)) return 'black';
        var min = "00FF00";
        var half = "0000FF";
        var max = "FF0000";

        value= Math.floor(value);

        if (value >bins){
            value-=bins;
            value--;
            let tmp = generateColor(max,half,bins);
            return '#'+tmp[value];
        } else{
            value--;
            let tmp = generateColor(half,min,bins);
            return '#'+tmp[value];
        }
    }


    // Polygon functions

    function getIndexOfVertex(pin){
        /*
         Pushpin pin https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-api/pushpin-class
         return int or null
         Each pushpin has index. This function returns it if pushpin belongs to our map.
         */
        for (var i=0;i<_vertexArray.length;++i){
            if (pin===_vertexArray[i]) return i;
        }
        return null;
    }

    function _checkIfPointInsidePolygon(latitude,longitude,isCircle){
        /*
        float latitude,
        float longitude,
        if isCricle:
                type8 -> map (with keys 'lon'->float, 'lat'->float and 'radius'->float)
           otherwise:
                type8 -> map[] (with keys 'lon'->float and 'lat'->float)
         return bool
         This function check if place is inside polygon of polygonOfInterest
     */
        if (isCircle){
            const meter_per_lon = 40075000*Math.cos(3.14*latitude/180)/360;
            var loc = _circlePin.getLocation();
            var x = (loc.latitude-latitude)*_meter_per_lat;
            var y = (loc.longitude-longitude)*meter_per_lon;
            return _circleRadius>Math.sqrt(x**2+y**2);
        }
        var locationArray = _vertexPolygon.getLocations();
        var numberOfIntersections=0;
        for (var i=1;i<locationArray.length;++i){
            var maxY = Math.max(locationArray[i-1].longitude,locationArray[i].longitude)
            var minY = Math.min(locationArray[i-1].longitude,locationArray[i].longitude)
            if ((longitude>minY)&&(longitude<maxY)){

                var firstPartOfLine = Math.abs(locationArray[i-1].longitude-longitude)
                var secondPartOfLine = Math.abs(locationArray[i].longitude-longitude)
                var division = firstPartOfLine/(firstPartOfLine+secondPartOfLine);
                var xPoint = locationArray[i-1].latitude+division*(locationArray[i].latitude- locationArray[i-1].latitude);
                if (xPoint<latitude) numberOfIntersections++;
            }
        }
        return numberOfIntersections%2===1;
    }


    function _getPolygonEdgeValues(isCircle){
        /*
            bool isCircle
            return Map with four keys. Each key is float that represent min and max value of lat and lon of polygon of interest
         */
        if ((_vertexPolygon == null)&&(!isCircle)) return null;
        if ((_circlePolygon==null)&&(isCircle)) return null;
        if (isCircle){
            var loc =_circlePin.getLocation();
            const meter_per_lon = 40075000*Math.cos(3.14*loc.latitude/180)/360;
            var edges = new Map();
            edges.set('min_latitude',loc.latitude -_circleRadius/_meter_per_lat );
            edges.set('max_latitude',loc.latitude +_circleRadius/_meter_per_lat );
            edges.set('min_longitude',loc.longitude -_circleRadius/meter_per_lon );
            edges.set('max_longitude',loc.longitude +_circleRadius/meter_per_lon );
            return  edges;
        }
        var locations = _vertexPolygon.getLocations();
        var edges = new Map();
        edges.set('min_latitude',locations[0].latitude);
        edges.set('max_latitude',locations[0].latitude);
        edges.set('min_longitude',locations[0].longitude);
        edges.set('max_longitude',locations[0].longitude);
        for (var i=1;i<(locations.length-1);++i){
            if (edges.get('min_latitude')>locations[i].latitude) edges.set('min_latitude',locations[i].latitude);
            if (edges.get('max_latitude')<locations[i].latitude) edges.set('max_latitude',locations[i].latitude);
            if (edges.get('min_longitude')>locations[i].longitude) edges.set('min_longitude',locations[i].longitude);
            if (edges.get('max_longitude')<locations[i].longitude) edges.set('max_longitude',locations[i].longitude);
        }
        return edges;
    }

    function _updateVertexPolygon(){
        /*
         This function is used to update polygon of interest. It is called when a status of vertex is changed. If there is
         less then 2 vertexes, polygon disappears
         */
        if (_vertexPolygon!=null) _MAP_REFERENCE.entities.remove(_vertexPolygon);
        if (_vertexArray.length>2) {
            var locationArray = getLocationArrayFromPinArray(_vertexArray);
            var polygon = new Microsoft.Maps.Polygon(locationArray,{fillColor:'white',visible:true});
            _MAP_REFERENCE.entities.push(polygon);
            _vertexPolygon = polygon
        } else _vertexPolygon=null;
    }


    function _getPixelLocationArray(latitude,longitude,latitudePrecision,longitudePrecision){
        /*
        float latitude,
        float longitude,
        float latitudePrecision,
        float longitudePrecision,
        return float[4]
        //This function return vertexes of pixel based on its center(latitude and longitude) and precision
     */
        var locationsArray=[]
        var loc = new Microsoft.Maps.Location(latitude-0.5*latitudePrecision,longitude-0.5*longitudePrecision);
        locationsArray.push(loc);
        loc = new Microsoft.Maps.Location(latitude+0.5*latitudePrecision,longitude-0.5*longitudePrecision);
        locationsArray.push(loc);
        loc = new Microsoft.Maps.Location(latitude+0.5*latitudePrecision,longitude+0.5*longitudePrecision);
        locationsArray.push(loc);
        loc = new Microsoft.Maps.Location(latitude-0.5*latitudePrecision,longitude+0.5*longitudePrecision);
        locationsArray.push(loc);
        return locationsArray;
    }

    function getLocationArrayFromPinArray(pinArray){
        /*
            PushPin[]  pinArray https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-api/pushpin-class
            return location[] https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-api/location-class
            This function get location of each pushpi
         */
        var retArr = [];
        for (var i=0;i<pinArray.length;++i)
        {
            var pin = pinArray[i];
            retArr.push(pin.getLocation());
        }
        return retArr;
    }

    function getIndexOfStation(pin){
        /*
            PushPin  pinArray https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-api/pushpin-class
            return int or null
            This function get lindex of pushpin
         */
        for (var i=0;i<_stationArray.length;++i){
            if (pin===_stationArray[i]) return i;
        }
        return null;
    }

    function changeStateOfStation(index,state){
        /*
           int index
           bool state
           This function change state (active,deactive) what changes its color on map. Moreover, station is not used
           to compute HDOP anymore
         */
        if (index>=_ifStationActive.length) return null;
        _ifStationActive[index] = state;
        if (state) _stationArray[index].setOptions({color:'green'});
        else _stationArray[index].setOptions({color:'red'});
    }

    function EditStation(loc,alt,index,name,func){
        /*
           location loc https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-api/location-class
           float alt
           int index
           string name
           function func or null
           This function edit information of a station with chosen index. It changes its location, altitude, name and
           adds function which is used when pushpin connected to function is dragged
         */
        var name2 = loc.latitude.toString().slice(0,7) + ', ' + loc.longitude.toString().slice(0,7);

        if (_ifStationActive[index]) var color='green';
        else color = 'red';
        var newPin = new Microsoft.Maps.Pushpin(loc, {
            title: name, color:color,draggable:true,subTitle:name2
        });
        _MAP_REFERENCE.entities.push(newPin);
        Microsoft.Maps.Events.addHandler(newPin,'dragend',  function (e) { _changeStationPosition(e); } );
        if (func!=null) Microsoft.Maps.Events.addHandler(newPin,'dragend',  function (e) { func(e); } );
        var oldPin = _stationArray[index];

        _MAP_REFERENCE.entities.remove(oldPin);
        _stationArray.splice(index,1,newPin);
        _stationAltitudeArray.splice(index,1,alt);
    }

    function addStation(loc,alt,name,func){
        /*
           location loc https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-api/location-class
           float alt
           string name
           function func or null
           This function add new station with chosen location, altitude, name and
           adds function which is used when pushpin connected to function is dragged
         */
        var name2 = loc.latitude.toString().slice(0,7) + ', ' + loc.longitude.toString().slice(0,7);

        var pin = new Microsoft.Maps.Pushpin(loc, {
            title: name,color: 'green',draggable:true,subTitle:name2
        });
        Microsoft.Maps.Events.addHandler(pin,'dragend',  function (e) { _changeStationPosition(e); } );
        if (func!=null) Microsoft.Maps.Events.addHandler(pin,'dragend',  function (e) { func(e); } );

        _MAP_REFERENCE.entities.push(pin);
        _stationArray.push(pin);
        _ifStationActive.push(true);
        _stationAltitudeArray.push(alt);
    }

    function deleteStation(index){
        // This function deletes a station with chosen index )int)
        var pin = _stationArray[index];
        _stationArray.splice(index,1);
        _stationAltitudeArray.splice(index,1);
        _ifStationActive.splice(index,1);
        _MAP_REFERENCE.entities.remove(pin);
    }

    function _changeStationPosition(e){
        // This function is used as event when station is stop being dragged. In this case, the subName that
        // information about location has to be changed
        var pin = e.target;
        var loc = pin.getLocation();
        var name2 = loc.latitude.toString().slice(0,7) + ', ' + loc.longitude.toString().slice(0,7);
        pin.setOptions({subTitle:name2});
    }


    function vertexPolygonVisibility(flag){
        // This function hides or shows polygon of interest depending on the flag (bool)
        if (_vertexPolygon!=null) _vertexPolygon.setOptions({visible:flag});
        for (var i=0;i<_vertexArray.length;++i) _vertexArray[i].setOptions({visible:flag});
    }

    function EditVertex(loc,index,func){
        /*
          location loc https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-api/location-class
          int index
          function func or null
          This function edit information of a vertex of polygon with chosen index. It changes its location, altitude and
          adds function which is used when pushpin connected to function is dragged
        */
        var name = 'Vertex ' + (index+1);
        var name2 = loc.latitude.toString().slice(0,7) + ', ' + loc.longitude.toString().slice(0,7);
        var newPin = new Microsoft.Maps.Pushpin(loc, {
            title: name,draggable:true,icon:'pin.png',subTitle:name2
        });
        Microsoft.Maps.Events.addHandler(newPin,'dragend',  function (e) { _changeVertexPosition(e); } );
        if (func!=null) Microsoft.Maps.Events.addHandler(newPin,'dragend',  function (e) { func(e); } );
        _MAP_REFERENCE.entities.push(newPin);
        var oldPin = _vertexArray[index];
        _MAP_REFERENCE.entities.remove(oldPin);
        _vertexArray.splice(index,1,newPin);
        _updateVertexPolygon();
    }

    function addVertex(loc,func,isSmartFindingVertexFlag){
        /*
          location loc https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-api/location-class
          function func or null
          bool isSmartFindingVertexFlag
          This function add vertex to polygon of intrest with chosen location. It also adds function which is used when
          pushpin connected to vertex is dragged. If isSmartFindingVertexFlag is true, function will try to find best position for vertex
          otherwise vertex will be added to last position
        */
        var pin = new Microsoft.Maps.Pushpin(loc, {
            draggable:true,icon:'pin.png'
        });
        Microsoft.Maps.Events.addHandler(pin,'dragend',  function (e) { _changeVertexPosition(e); } );
        if (func!=null) Microsoft.Maps.Events.addHandler(pin,'dragend',  function (e) { func(e); } );
        let index;
        if ((_vertexArray.length>2)&&(isSmartFindingVertexFlag)) {
            index = _findNewVertexIndex(pin);
            _vertexArray.splice(index, 0, pin);
            _renameVertex(index-1);
        } else {
            index = _vertexArray.length;
            _vertexArray.push(pin);
        }
        var name = 'Vertex ' + (index+1);
        var name2 = loc.latitude.toString().slice(0,7) + ', ' + loc.longitude.toString().slice(0,7);

        pin.setOptions({title: name,subTitle:name2});
        _MAP_REFERENCE.entities.push(pin);
        _updateVertexPolygon();
        return index;
    }

    function _renameVertex(index){
        // This function is used to restart name of vertex with chosen index
        for (let i=index;i<_vertexArray.length;++i){
            _vertexArray[i].setOptions({title: 'Vertex '+(i+1)});
        }
    }

    function _findNewVertexIndex(vertex){
        /*
            PushPin vertex https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-api/pushpin-class
            This function is used to find best index for vertex in the polygon of interest
         */
        let loc = vertex.getLocation();
        let index=0;
        let minDistance = Number.MAX_VALUE;
        let mainDirection = null;
        for (let i=0;i<_vertexArray.length;++i){
            let [distance,direction] = _computeDistanceToLineOfPolygon(loc,i);
            if (distance<minDistance){
                minDistance=distance;
                index = (i+1);
                mainDirection = direction;
            } else if ((distance==minDistance)&&(index>0)){
                index = _computeBetterLineBasedOnDirections(loc,index,i,mainDirection,direction)
            }
        }
        return index;
    }

    function _computeBetterLineBasedOnDirections(loc,index1,index2,direction1,direction2){
        /*
            location loc https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-api/location-class
          int index1
          int index1
          float[2] direction1 (unit vector)
          float[2] direction2 (unit vector)
            This function is called by _findNewVertexIndex when two lines has same distance to new veretex. It checks
            which one is better based on the direction
         */
        let locVertex1 = _vertexArray[index1].getLocation();
        let locVertex2 = _vertexArray[index2].getLocation();
        let polygonPoint1XYZ= _geodetic2enu(locVertex1.latitude,locVertex1.longitude,0,loc.latitude,loc.longitude,0);
        let polygonPoint2XYZ= _geodetic2enu(locVertex2.latitude,locVertex2.longitude,0,loc.latitude,loc.longitude,0);
        polygonPoint1XYZ = math.add(polygonPoint1XYZ,direction1);
        polygonPoint2XYZ = math.add(polygonPoint2XYZ,direction2);
        if (math.norm(polygonPoint1XYZ,2)<math.norm(polygonPoint2XYZ,2)){
            return (index2+1);
        } else return (index1);
    }

    function _computeDistanceToLineOfPolygon(loc,currentIndex){
        /*
           location loc https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-api/location-class
           int currentIndex
           return float
           This function computes lowest distance to line of the polygon

         */
        let direction;
        let nextIndex = currentIndex+1;
        if (nextIndex == _vertexArray.length) nextIndex=0;
        let locVertex1 = _vertexArray[currentIndex].getLocation()
        let locVertex2 = _vertexArray[nextIndex].getLocation()
        let polygonPoint1XYZ= _geodetic2enu(locVertex1.latitude,locVertex1.longitude,0,loc.latitude,loc.longitude,0);
        let polygonPoint2XYZ= _geodetic2enu(locVertex2.latitude,locVertex2.longitude,0,loc.latitude,loc.longitude,0);
        let deltaPolygonPointXYZ = math.subtract(polygonPoint1XYZ,polygonPoint2XYZ);
        let segmentLength = math.norm(deltaPolygonPointXYZ,2);
        let crossPointOnSegment = math.divide(math.multiply(polygonPoint1XYZ,deltaPolygonPointXYZ),segmentLength**2);
        let shortestDistance;
        if (crossPointOnSegment<0){
            direction = math.divide(deltaPolygonPointXYZ,segmentLength);
            shortestDistance=math.norm(polygonPoint1XYZ,2);
        } else if (crossPointOnSegment>1){
            direction = math.divide(deltaPolygonPointXYZ,-segmentLength);
            shortestDistance=math.norm(polygonPoint2XYZ,2);
        } else{
            direction = null;
            shortestDistance = math.norm(math.subtract(polygonPoint1XYZ,math.multiply(crossPointOnSegment,deltaPolygonPointXYZ)),2)
        }
        return [shortestDistance,direction];
    }

    function deleteVertex(index){
        // This function dletes a vertex with chosen index (int)
    	var pin;
        for (var i=(index+1);i<_vertexArray.length;i++){
            pin =  _vertexArray[i];
            let name = 'Vertex '+(i);
            pin.setOptions({title: name});
        }
        pin = _vertexArray[index];
        _vertexArray.splice(index,1)
        _MAP_REFERENCE.entities.remove(pin);
        _updateVertexPolygon();
    }

    function _changeVertexPosition(e){
        //This function is used as an event when vertex is dragged.
        _updateVertexPolygon();
        var pin = e.target;
        var loc = pin.getLocation();
        var name2 = loc.latitude.toString().slice(0,7) + ', ' + loc.longitude.toString().slice(0,7);
        pin.setOptions({subTitle:name2});
    }

    function swapVertexes(index1,index2){
        // This function is used to swap indexes (2 ints) of vertexes
        let helper = _vertexArray[index1];
        _vertexArray[index1] = _vertexArray[index2];
        _vertexArray[index2] = helper;
        _swapNameOfVertexes(index1,index2);
        _updateVertexPolygon();

    }

    function _swapNameOfVertexes(index1,index2){
        // This function is used to swap names of vertexes based on their indexes (2 ints)
        let title1 =  _vertexArray[index1].getTitle();
        let title2 =  _vertexArray[index2].getTitle();
        _vertexArray[index1].setOptions({title:title2});
        _vertexArray[index2].setOptions({title:title1});
    }

    // Circle functions

    function circlePolygonVisibility(flag){
        // This function hides or shows circle interest depending on the flag (bool)
        if (_circlePolygon!=null) {
            _circlePolygon.setOptions({visible:flag});
            _circlePin.setOptions({visible:flag});
        }
    }

    function _calculateVertexesOfCircle(lat,lon,radius){
        /*
            float lat
            float lon
            float radius
            This function is used to create a polygon for circle intrest when cirlce is added.
         */

        var angle = 0
        var vertexes=[]
        const meter_per_lon = 40075000*Math.cos(3.14*lat/180)/360;
        _MAP_REFERENCE.entities.remove(_circlePolygon);
        for (var i=0;i<30;++i){
            var x = radius*Math.cos(angle)/_meter_per_lat;
            var y = radius*Math.sin(angle)/meter_per_lon;
            var loc = new Microsoft.Maps.Location(lat+x,lon+y);
            vertexes.push(loc);
            angle+= 6.28/30;
        }
        if (_circlePolygon !=null) _MAP_REFERENCE.entities.remove(_circlePolygon);
        _circlePolygon = new Microsoft.Maps.Polygon(vertexes,{fillColor:'white',visible:true});
        _MAP_REFERENCE.entities.push(_circlePolygon);
    }


    function addCircle(loc,radius,func){
        /*
            location loc https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-api/location-class
            float radius
            func null or function
            This function is used to create cirlce of intrest with chosen locationa dn radius. When center is dragged,
            func is called if it is not null
         */
        clearHDOP();
        var name2 = loc.latitude.toString().slice(0,7) + ', ' + loc.longitude.toString().slice(0,7);
        var pin = new Microsoft.Maps.Pushpin(loc, {
            title: 'circle',draggable:true,icon:'pin.png',subTitle:name2
        });
        Microsoft.Maps.Events.addHandler(pin,'dragend',  function (e) { _changeCirclePosition(e); } );
        if (func!=null) Microsoft.Maps.Events.addHandler(pin,'dragend',  function (e) { func(e); } );
        if (_circlePin !=null) _MAP_REFERENCE.entities.remove(_circlePin);
        _MAP_REFERENCE.entities.push(pin);
        _circleRadius=radius;
        _circlePin=pin;
        _calculateVertexesOfCircle(loc.latitude,loc.longitude,radius);
    }

    function _changeCirclePosition(e){
        /*
            This function is an event and is used when center of circle of intrest is dragged
         */
        var pin = e.target;
        var loc = pin.getLocation();
        _calculateVertexesOfCircle(loc.latitude,loc.longitude,_circleRadius);
        var name2 = loc.latitude.toString().slice(0,7) + ', ' + loc.longitude.toString().slice(0,7);
        pin.setOptions({subTitle:name2});
    }

    function deleteCircle(){//This function is used to delete circle of intrest
        clearHDOP();
        _MAP_REFERENCE.entities.remove(_circlePin);
        _circlePin = null
        _MAP_REFERENCE.entities.remove(_circlePolygon);
        _circlePolygon = null;
    }

    //  Map functions


    function checkIfMapIsSet(){
        // This function return true when map is set, False oterwise
        return _MAP_REFERENCE != null;
    }

    function setMap(reference) {
        // Map reference https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-api/map-class
        // This function set chosen map as the main map
        _MAP_REFERENCE = reference;
    }

    function addHandlerMap(typeOfEvent,func) {
        /*
        string typeOfEvent
        function func
        This function is used to add handling of event
         */
        deleteHandler(typeOfEvent);
        var referenceToHandler = Microsoft.Maps.Events.addHandler(_MAP_REFERENCE,typeOfEvent, func );
        _handlers.set(typeOfEvent,referenceToHandler);
    }

    function deleteHandler(typeOfEvent){
        // This function is used to delete all events bases connected to tyoeOfEvent (string)
        if (_handlers.get(typeOfEvent)!=null){
            Microsoft.Maps.Events.removeHandler(_handlers.get(typeOfEvent));
            _handlers.delete(typeOfEvent);
        }
    }
    return {
        addVertex:addVertex,
        setMap: setMap,
        EditStation:EditStation,
        EditVertex:EditVertex,
        addStation:addStation,
        deleteStation:deleteStation,
        deleteVertex:deleteVertex,
        addHandlerMap: addHandlerMap,
        deleteHandler:deleteHandler,
        calculateHDOP:calculateHDOP,
        addCircle:addCircle,
        deleteCircle:deleteCircle,
        setOutputId:setOutputId,
        vertexPolygonVisibility:vertexPolygonVisibility,
        circlePolygonVisibility:circlePolygonVisibility,
        changeStateOfStation:changeStateOfStation,
        getIndexOfVertex:getIndexOfVertex,
        getIndexOfStation:getIndexOfStation,
        setClearFunction:setClearFunction,
        setBlockFunction:setBlockFunction,
        setCenter:setCenter,
        getCenter:getCenter,
        checkIfMapIsSet:checkIfMapIsSet,
        getHDOPPixels:getHDOPPixels,
        getHDOPValues:getHDOPValues,
        createPixelsFromData:createPixelsFromData,
        clearHDOP:clearHDOP,
        swapVertexes:swapVertexes,
    };
})();
