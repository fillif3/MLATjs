


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
    // VDOP varaibales (references)
    var _VDOPPixels = [];
    var _VDOPValues = [];
    // Circle variables
    var _circleRadius=0;
    var _circlePin=null;
    var _circlePolygon=null;
    // Variables connected to computing VDOP
    var _outputId='';
    var _edges=null;
    var _latitudePrecision = 0;
    var _longitudePrecision = 0;
    var _currentLatitude=0;
    var _currentLongitude = 0;
    var _step=0;
    var _clearFunction=null;
    var _blockFunction=null
    var _endVDOPComputation=false;


    function createPixelsFromData(pixelsLocations,values) {
        for (let i=0;i<pixelsLocations.length;++i){
            try {
                let locs=[];
                for (var j=0;j<4;++j){
                    let loc = new Microsoft.Maps.Location(pixelsLocations[i][j][0], pixelsLocations[i][j][1]);
                    locs.push(loc);
                }

                let color = _getColor(values[i])
                //alert(loc+' '+pixelsLocations[i]+' '+values[i]+' '+pixelsLocations.length+' '+values.length)
                let pixel = new Microsoft.Maps.Polygon(locs, {strokeThickness: 0, fillColor: color});
                Microsoft.Maps.Events.addHandler(pixel, "mouseover", function (e) {
                    _showVDOP(e);
                });
                _MAP_REFERENCE.entities.push(pixel);
                _VDOPPixels.push(pixel);
                _VDOPValues.push(values[i]);
            }
            catch (e){

            }

        }
    }

    function getVDOPPixels(){
        return _VDOPPixels;
    }

    function getVDOPValues(){
        return _VDOPValues;
    }

    function checkIfMapIsSet(){
        if (_MAP_REFERENCE== null) return false;
        return true;
    }

    // Setting variables

    function getCenter(){
        return _MAP_REFERENCE.getCenter();
    }

    function setCenter(lat,lon){
        _MAP_REFERENCE.setView({
            center: new Microsoft.Maps.Location(lat,lon)
        });
    }

    function stop(){
        window.api.send("toMain", ['Stop']);
    }

    function setOutputId(val){

        _outputId=val;
        //throw 'qweqwe';
    }


    // Setting functions

    function setBlockFunction(func){
        _blockFunction=func;
    }

    function setClearFunction(func){
        _clearFunction=func;
    }

    // Geometry transformations between coordiates - Start

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

    function _geodetic2enu(lat, lon, h, lat0, lon0, h0){
        var [x1, y1, z1] = _geodetic2ecef(lat, lon, h);
        var [x2, y2, z2] = _geodetic2ecef(lat0, lon0, h0);
        var [east,north,up] = _uvw2enu(x1-x2, y1-y2, z1-z2, lat0, lon0);
        return [east,north,up];
    }

    function _degrees_to_radians(degrees)
    {
        var pi = Math.PI;
        return degrees * (pi/180);
    }

    // Jacobian functions

    function _compute_Q(size){
        return math.add(math.identity(size),math.ones(size,size));
    }

    function _create_array2D(size1,size2){
        var arr=[];
        //throw "koniec";
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
        //refence_derievative = (position[0:2] - anchors[-1][0:2]) / dist_to_refernce

        var refence_derievative = math.multiply(math.subtract(math.subset(position,math.index([0, 1])),
            math.subset(anchors,math.index(0, [0, 1]))[0]),1/distToReference);

        for (var i=0;i<(anchors.length-1);++i){

            var distToCurrent = math.norm(math.subtract(position,math.subset(anchors,math.index(i+1, [0, 1,2]))[0]));

            var gradient = math.multiply(math.subtract(math.subset(position,math.index([0, 1])),
                math.subset(anchors,math.index(i+1, [0, 1]))[0]),1/distToCurrent);

            jacobian[i][0]=gradient[0]-refence_derievative[0];
            jacobian[i][1]=gradient[1]-refence_derievative[1];

            //throw "koniec";

        }

        return jacobian;
    }

    // Computing VDOP

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
                var equation = math.multiply(transposed_Jacobian, Jacobian);//np.dot(tran_J,J)
                equation = math.inv(equation);//np.linalg.inv(equation)
                equation = math.multiply(equation, transposed_Jacobian);//np.dot(equation,tran_J)
                equation = math.multiply(equation, Q);//np.dot(equation, Q)
                equation = math.multiply(equation, Jacobian);//np.dot(equation, J)
                equation = math.multiply(equation, math.inv(math.multiply(transposed_Jacobian, Jacobian)));//np.dot(equation, np.linalg.inv(np.dot(tran_J,J)))

                let out = Math.sqrt(equation._data[0][0] + equation._data[1][1]);
                if (out < minVDOP) minVDOP = out;

            }
                //}
            catch (e) {
            }
        }
        return minVDOP;
    }


    function _computeColorBasedOnVDOP(currentLatitude,currentLongitude,altitude,base_station,newStationArray){
        var position = [0,0,0];
        var anchors=[];
        for (var i=0;i<newStationArray.length;++i){
            var loc = newStationArray[i].getLocation();
            anchors.push(_geodetic2enu(loc.latitude,loc.longitude,_stationAltitudeArray[i],currentLatitude,currentLongitude,altitude));
        }

        var VDOP = _computeSingleVDOP(anchors,position,base_station);
        _VDOPValues.push(VDOP);
        return _getColor(VDOP);

    }

    function _getPolygonOfInterest(isCircle){

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

    function calculateVDOP(lat_res,lon_res,altitude,base_station,isCircle,timeout){

        _startTimeForDebugging=performance.now();
        _endVDOPComputation=false;

        if ((_vertexArray.length<3)&&(!isCircle)) {
            alert('There is no polygon. You need more vertexes');
            return null;
        }
        if ((_circlePolygon==null)&&(isCircle)) {
            alert('There is no circle. You need to choose center of circle');
            return null;
        }

        if ((lat_res*lon_res)>50000) if (!window.confirm("You typed high resolution. Are you sure? It can take some to finish")) return null;

        _clearVDOP();

        var newStationArray = [];
        if (_ifStationActive!=null){
            for (var i=0;i<_ifStationActive.length;++i){
                if (_ifStationActive[i]) newStationArray.push(_stationArray[i]);
            }
        } else newStationArray = _stationArray;

        if (timeout ===4) _step = 30;
        else _step = 5;
        base_station--;





        if (newStationArray.length<3) {
            alert('There are less then 3 active stations. You need at least 3 active stations to compute measurement errors');
            return null;
        }
        if (_blockFunction!=null) _blockFunction();


        _edges = _getPolygonEdgeValues(isCircle);
        let stationLocations=[]
        for (let i=0;i<newStationArray.length;i++){
            let loc = newStationArray[i].getLocation();
            stationLocations.push([loc.latitude,loc.longitude])
        }
        let polygonOfIntrest = _getPolygonOfInterest(isCircle);//TODO
        _latitudePrecision = (_edges.get('max_latitude') - _edges.get('min_latitude'))/lat_res;
        _longitudePrecision = (_edges.get('max_longitude') - _edges.get('min_longitude'))/lon_res;
        window.api.send("toMain", ['VDOP',stationLocations,_edges,altitude,base_station,isCircle,_latitudePrecision,
            _longitudePrecision,polygonOfIntrest]);

        _currentLatitude= _edges.get('min_latitude');
        //var n = performance.now();

        //calculateVDOPWithTimeOUT(newStationArray,altitude,base_station,isCircle,timeout);

        // For debigging
        if (_vertexPolygon!=null) _vertexPolygon.setOptions({visible:false});
        if (_circlePolygon!=null) _circlePolygon.setOptions({visible:false});
        //if (_clearFunction!=null) _clearFunction();
        return 0;
    }

    function calculateVDOPWithTimeOUT(newStationArray,altitude,base_station,isCircle,timeout){

        for (let i=0;i<_step;++i) {
            _currentLongitude= _edges.get('min_longitude');
            while (_currentLongitude < _edges.get('max_longitude')) {

                if (_checkIfPointInsidePolygon(_currentLatitude, _currentLongitude, isCircle)) {
                    var locationArray = _getPixelLocationArray(_currentLatitude, _currentLongitude, _latitudePrecision, _longitudePrecision);


                    var color = _computeColorBasedOnVDOP(_currentLatitude, _currentLongitude, altitude, base_station, newStationArray);

                    var pixel = new Microsoft.Maps.Polygon(locationArray, {strokeThickness: 0, fillColor: color});
                    Microsoft.Maps.Events.addHandler(pixel, "mouseover", function (e) {
                        _showVDOP(e);
                    });
                    _MAP_REFERENCE.entities.push(pixel);
                    _VDOPPixels.push(pixel);
                }
                _currentLongitude += _longitudePrecision;
            }
            _currentLatitude += _latitudePrecision;
        }


        if ((_currentLatitude<_edges.get('max_latitude'))&&(!_endVDOPComputation)) {
            setTimeout(function() {
                calculateVDOPWithTimeOUT(newStationArray,altitude,base_station,isCircle);
            }, timeout)
        }

        else{
            if (_vertexPolygon!=null) _vertexPolygon.setOptions({visible:false});
            if (_circlePolygon!=null) _circlePolygon.setOptions({visible:false});
            _endTimeForDebugging = performance.now();
            if (_clearFunction!=null) _clearFunction();

        }


    }

    function _showVDOP(e){
        var pixel = e.target;
        for (var i=0;i<_VDOPPixels.length;++i){
            if (_VDOPPixels[i]===pixel){
                break;
            }
        }

        if (_outputId!=='') document.getElementById(_outputId).value = _VDOPValues[i].toString().slice(0,7);
        getLocalizationMeasurmentError();
    }

    function _clearVDOP(){

        for (var i=0;i<_VDOPPixels.length;++i){
            _MAP_REFERENCE.entities.remove(_VDOPPixels[i]);
        }
        _VDOPPixels=[];
        _VDOPValues=[];
    }



    function _getColor(val){
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

            var tmp = generateColor(max,half,bins);

            return '#'+tmp[value];
        } else{
            value--;
            var tmp = generateColor(half,min,bins);

            return '#'+tmp[value];
        }


    }


    // Polygon functions

    function getIndexOfVertex(pin){
        for (var i=0;i<_vertexArray.length;++i){
            if (pin===_vertexArray[i]) return i;
        }
        return null;
    }

    function _checkIfPointInsidePolygon(latitude,longitude,isCircle){
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
        if (_vertexPolygon!=null) _MAP_REFERENCE.entities.remove(_vertexPolygon);
        if (_vertexArray.length>2) {
            var locationArray = getLocationArrayFromPinArray(_vertexArray);
            var polygon = new Microsoft.Maps.Polygon(locationArray,{fillColor:'white',visible:true});
            _MAP_REFERENCE.entities.push(polygon);
            _vertexPolygon = polygon
        } else _vertexPolygon=null;

    }


    function _getPixelLocationArray(latitude,longitude,latitudePrecision,longitudePrecision){
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
        var retArr = [];
        for (var i=0;i<pinArray.length;++i)
        {
            var pin = pinArray[i];
            retArr.push(pin.getLocation());
        }
        return retArr;

    }



    function getIndexOfStation(pin){
        for (var i=0;i<_stationArray.length;++i){
            if (pin===_stationArray[i]) return i;
        }
        return null;
    }

    function changeStateOfStation(index,state){
        if (index>=_ifStationActive.length) return null;
        _ifStationActive[index] = state;
        if (state) _stationArray[index].setOptions({color:'green'});
        else _stationArray[index].setOptions({color:'red'});
    }

    function EditStation(loc,alt,index,name,func){
        var name2 = loc.latitude.toString().slice(0,7) + ', ' + loc.longitude.toString().slice(0,7);

        if (_ifStationActive[index]) var color='green';
        else color = 'red';
        var newPin = new Microsoft.Maps.Pushpin(loc, {
            title: name, color:color,draggable:true,subTitle:name2
            // subTitle: number.toString()
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
        var pin = _stationArray[index];
        _stationArray.splice(index,1);
        _stationAltitudeArray.splice(index,1);
        _MAP_REFERENCE.entities.remove(pin);
    }

    function _changeStationPosition(e){
        var pin = e.target;
        var loc = pin.getLocation();
        var name2 = loc.latitude.toString().slice(0,7) + ', ' + loc.longitude.toString().slice(0,7);
        pin.setOptions({subTitle:name2});
    }


    function vertexPolygonVisibility(flag){
        if (_vertexPolygon!=null) _vertexPolygon.setOptions({visible:flag});
        for (var i=0;i<_vertexArray.length;++i) _vertexArray[i].setOptions({visible:flag});
    }

    function EditVertex(loc,index,func){
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

    function addVertex(loc,func){
        //var number = _vertexArray.length+1


        var pin = new Microsoft.Maps.Pushpin(loc, {
            draggable:true,icon:'pin.png'
            // subTitle: number.toString()
        });
        Microsoft.Maps.Events.addHandler(pin,'dragend',  function (e) { _changeVertexPosition(e); } );
        if (func!=null) Microsoft.Maps.Events.addHandler(pin,'dragend',  function (e) { func(e); } );

        let index;


        if (_vertexArray.length>2) {
            index = _findNewVertexIndex(pin);
            _vertexArray.splice(index, 0, pin);
            _renameVertexes(index-1);
            //_renameVertexes(index-1);
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

    function _renameVertexes(index){
        for (let i=index;i<_vertexArray.length;++i){
            //alert(i);
            _vertexArray[i].setOptions({title: 'Vertex '+(i+1)});
        }
    }

    function _findNewVertexIndex(vertex){
        let loc = vertex.getLocation();
        let index=0;
        let minDistance = Number.MAX_VALUE;
        for (let i=0;i<_vertexArray.length;++i){
            let distance = _computeDistanceToLineOfPolygon(loc,i);
            if (distance<minDistance){
                minDistance=distance;
                index = (i+1);
            }
        }
        return index;
        //return minDistance;
    }

    function _computeDistanceToLineOfPolygon(loc,currentIndex){
        let nextIndex = currentIndex+1;

        if (nextIndex == _vertexArray.length) nextIndex=0;
        let locVertex1 = _vertexArray[currentIndex].getLocation()
        let locVertex2 = _vertexArray[nextIndex].getLocation()
        let polygonPoint1XYZ= _geodetic2enu(locVertex1.latitude,locVertex1.longitude,0,loc.latitude,loc.longitude,0);
        let polygonPoint2XYZ= _geodetic2enu(locVertex2.latitude,locVertex2.longitude,0,loc.latitude,loc.longitude,0);
        let deltaPolygonPointXYZ = math.subtract(polygonPoint1XYZ,polygonPoint2XYZ);
        let segmentLength = math.norm(deltaPolygonPointXYZ,2);
        //let deltaPolygonPointXYZUnit = math.divide(deltaPolygonPointXYZ,segmentLength);
        let crossPointOnSegment = math.divide(math.multiply(polygonPoint1XYZ,deltaPolygonPointXYZ),segmentLength**2);
        let shortestDistance;
        if (crossPointOnSegment<0){
            //alert('lewo')
            shortestDistance=math.norm(polygonPoint1XYZ,2);
        } else if (crossPointOnSegment>1){
            //alert('prawo')
            shortestDistance=math.norm(polygonPoint2XYZ,2);
        } else{
            //alert('środerk')
            shortestDistance = math.norm(math.subtract(polygonPoint1XYZ,math.multiply(crossPointOnSegment,deltaPolygonPointXYZ)),2)
        }
        return shortestDistance;


    }

    function deleteVertex(index){
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
        _updateVertexPolygon();
        var pin = e.target;
        var loc = pin.getLocation();
        var name2 = loc.latitude.toString().slice(0,7) + ', ' + loc.longitude.toString().slice(0,7);
        pin.setOptions({subTitle:name2});
    }

    // Circle functions

    function circlePolygonVisibility(flag){
        if (_circlePolygon!=null) {
            _circlePolygon.setOptions({visible:flag});
            _circlePin.setOptions({visible:flag});
        }


    }

    function _calculateVertexesOfCircle(lat,lon,radius){
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
        _clearVDOP();
        var name2 = loc.latitude.toString().slice(0,7) + ', ' + loc.longitude.toString().slice(0,7);


        var pin = new Microsoft.Maps.Pushpin(loc, {
            title: 'circle',draggable:true,icon:'pin.png',subTitle:name2
            // subTitle: number.toString()
        });
        Microsoft.Maps.Events.addHandler(pin,'dragend',  function (e) { _changeCirclePosition(e); } );
        if (func!=null) Microsoft.Maps.Events.addHandler(pin,'dragend',  function (e) { func(e); } );
        if (_circlePin !=null) _MAP_REFERENCE.entities.remove(_circlePin);
        _MAP_REFERENCE.entities.push(pin);
        _circleRadius=radius;
        _circlePin=pin;
        _calculateVertexesOfCircle(loc.latitude,loc.longitude,radius);
        //_updateVertexPolygon();
    }

    function _changeCirclePosition(e){
        var pin = e.target;
        var loc = pin.getLocation();
        _calculateVertexesOfCircle(loc.latitude,loc.longitude,_circleRadius);
        var name2 = loc.latitude.toString().slice(0,7) + ', ' + loc.longitude.toString().slice(0,7);
        pin.setOptions({subTitle:name2});
    }

    function deleteCircle(){
        _clearVDOP();
        _MAP_REFERENCE.entities.remove(_circlePin);
        _circlePin = null
        _MAP_REFERENCE.entities.remove(_circlePolygon);
        _circlePolygon = null;
    }

    //  Map functions

    function setMap(reference) {
        _MAP_REFERENCE = reference;
    }

    function addHandlerMap(typeOfEvent,func) {
        deleteHandler(typeOfEvent);
        var referenceToHandler = Microsoft.Maps.Events.addHandler(_MAP_REFERENCE,typeOfEvent, func );
        _handlers.set(typeOfEvent,referenceToHandler);
    }

    function deleteHandler(typeOfEvent){
        if (_handlers.get(typeOfEvent)!=null){
            Microsoft.Maps.Events.removeHandler(_handlers.get(typeOfEvent));
            _handlers.delete(typeOfEvent);
        }
    }


    //function getMap() {
    //    return _MAP_REFERENCE;
    //}

    return {
        addVertex:addVertex,
        setMap: setMap,
        //getMap: getMap,
        EditStation:EditStation,
        EditVertex:EditVertex,
        addStation:addStation,
        deleteStation:deleteStation,
        deleteVertex:deleteVertex,
        addHandlerMap: addHandlerMap,
        deleteHandler:deleteHandler,
        calculateVDOP:calculateVDOP,
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
        stop:stop,
        setCenter:setCenter,
        getCenter:getCenter,
        checkIfMapIsSet:checkIfMapIsSet,
        getVDOPPixels:getVDOPPixels,
        getVDOPValues:getVDOPValues,
        createPixelsFromData:createPixelsFromData,
    };
})();
