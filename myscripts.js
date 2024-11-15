window.api.receive("fromMain", (data) => {
    /*
        This function is used for communication with the main process. The first arg in the array is used to determie
        which methdo should be called, the rest are arguments
     */
    if (data[0]=='load') loadTables(data[1]);
    else if (data[0]=='save') window.api.send("toMain", ['save',data[1],saveTables()]);
    else if (data[0]=='clear') restartMap(true);
    else if (data[0]=='error') alert('the operation failed');
    else if (data[0]=='test') alert('test');
    else if (data[0]=='HDOP') mapModule.createPixelsFromData(data[1],data[2]);
    else if (data[0]=='HDOPend') restoreVisuals();
    else if (data[0]=='firstRun') {
        window.api.send("toMain", ['save',data[1],getExample(1)]);
        window.api.send("toMain", ['save',data[2],getExample(2)]);
    } else if (data[0]=='Example') loadTables(getExample(data[1]));
    else if (data[0]=='gotKey') GetMap2();
    //else if (data[0]=='wrongKey') alert('wrong key');
});

//Saving and loading



function restartMap(askFlag){
    // This function is used to restart map (is usually called when 'new' is clicked in the top menu. If askFlag is
    // true, user will be asked if they are usre.
    if (askFlag) if (!confirm('Do you want to clear the map and tables? Unsaved progress will be lost.')) return null;
    mapModule.clearHDOP();
    let table = document.getElementById('stationTable');
    while(table.rows.length>1) deleteRowAndUpdateTable(table.rows[1].cells[0].firstChild,'station')
    table = document.getElementById('vertexTable');
    while(table.rows.length>1) deleteRowAndUpdateTable(table.rows[1].cells[0].firstChild,'vertex')
    table = document.getElementById('circleOfInterest');
    while(table.rows.length>2) deleteRowAndUpdateTable(table.rows[2].cells[0].firstChild,'circle')

}

/*
    The save file (txt) structure:
    - Values are separated with new line
    - Types of array of values are separated with 'end' line
    - First type of array of values has information about all stations [lat,lon,alt,name,checked]
    - Second  type of array of values has information about all vertexes [lat,lon]
    - 3rd type of  array of values has information about circle [lat,lon,alt]
    - 4th type of array of values has information about addational parameters [lat Resolution ,lon Resolution,alt,
    selected station index,ifComplexPolygon]
    - 5th type of array of values has information about center of map [lat,lon]
    - 6th type of array  of values has information about pixels [4*[lat,lon] for each vertex and HDOP value]
*/

function loadTables(text){ //Move thorugh entire save. Sends data from save to tables and map module
    restartMap(false);
    try {
        let arrText = text.split('\n');
        var index = 0;
        var arrHelper;
        var counter = 1;
        while (arrText[index] !== 'end') { //Update stations
            arrHelper = [];
            for (let i = 0; i < 5; i++) {
                arrHelper.push(arrText[index])
                index++;
            }
            let loc = new Microsoft.Maps.Location(arrHelper[0], arrHelper[1]);
            mapModule.addStation(loc, arrHelper[2], arrHelper[3], changeStationInTable)
            let table = document.getElementById("stationTable");
            let content = [counter, arrHelper[0], arrHelper[1], arrHelper[2], arrHelper[3]];
            addNewRowToTable("stationTable", newRow, content,
                '<button type="button" onclick=editRowAndUpdateTable(this,"station") class="buttonSkip fullWidth">Apply</button>',
                '<button type="button" onclick=deleteRowAndUpdateTable(this,"station") class="buttonSkip fullWidth">Delete</button>',
                '<input type="checkbox" onchange="changeStateofStation(this)" id="scales" name="scales" checked>');
            addStationToList();
            if (arrHelper[4] == 'false') {
                table.rows[counter].cells[5].firstChild.checked = false;
                changeStateofStation(table.rows[counter].cells[5].firstChild);
            }

            counter++;

        }
        index++;
        counter = 1;
        while (arrText[index] !== 'end') { //Update vertexes
            arrHelper = [];
            for (let i = 0; i < 2; i++) {
                arrHelper.push(arrText[index])
                index++;
            }
            let loc = new Microsoft.Maps.Location(arrHelper[0], arrHelper[1]);
            mapModule.addVertex(loc, changeVertexInTable,false)
            var table = document.getElementById("vertexTable");
            var newRow = table.rows.length;
            var content = [counter, arrHelper[0], arrHelper[1]];
            addNewRowToTable("vertexTable", newRow, content,
                '<button type="button" onclick=editRowAndUpdateTable(this,"Vertex") class="buttonSkip fullWidth">Apply</button>',
                '<button type="button" onclick=deleteRowAndUpdateTable(this,"Vertex") class="buttonSkip fullWidth">Delete</button>',
                ['<button type="button" onclick=moveVertexLeft(this,"Vertex") class="buttonSkip ">L</button>',
                    '<button type="button" onclick=moveVertexRight(this,"Vertex") class="buttonSkip ">R</button>']);
            counter++;
        }

        index++;
        while (arrText[index] !== 'end') { //Update circle
            arrHelper = [];
            for (let i = 0; i < 3; i++) {
                arrHelper.push(arrText[index])
                index++;
            }
            let loc = new Microsoft.Maps.Location(arrHelper[0], arrHelper[1]);
            mapModule.addCircle(loc, arrHelper[2], changeCircleInTable)
            var content = [arrHelper[0], arrHelper[1], arrHelper[2]];
            addNewRowToTable("circleOfInterest", 2, content,
                '<button type="button" onclick=editRowAndUpdateTable(this,"Circle") class="buttonSkip fullWidth">Apply</button>',
                '<button type="button" onclick=deleteRowAndUpdateTable(this,"Circle") class="buttonSkip fullWidth">Delete</button>');
        }//Update parameters
        index++;
        document.getElementById('latitudeResolutionInput').value = arrText[index];
        index++;
        document.getElementById('longitudeResolutionInput').value = arrText[index];
        index++;
        document.getElementById('altitudeInput').value = arrText[index];
        index++;
        document.getElementById('selectStationList').value = arrText[index];


        index++;
        document.getElementById('polygonCheckBox').checked = (arrText[index] == 'true');

        togglePolygon(document.getElementById('polygonCheckBox'));
        index++;
        mapModule.setCenter(arrText[index + 1], arrText[index + 2]);
        index += 4;
        let HDOPPixelsLocations = [];
        let HDOPValues = [];
        while (arrText[index] !== 'end') { //Update HDOP pixels on the map
            document.getElementById('PanelHDOP').style.display = "block";
            let helper = []
            for (let i = 0; i < 4; i++) {

                let loc = [parseFloat(arrText[index]), parseFloat(arrText[index + 1])];
                helper.push(loc);

                index += 2;
            }
            HDOPPixelsLocations.push(helper);
            HDOPValues.push(arrText[index])
            index++;
        }
        mapModule.createPixelsFromData(HDOPPixelsLocations, HDOPValues);
    }
    catch (e){
        window.api.send("toMain", ['clearSavePath']);
        alert('There is something wrong with save.')
    }

}

function saveTables(){
    var textToSave ='';
    var element= document.getElementById('stationTable');
    for (let i=1;i<element.rows.length;i++){ //Save stations
        for (let j=1;j<6;j++){
            if (j==5) textToSave+= element.rows[i].cells[j].firstChild.checked+'\n';
            else textToSave+= element.rows[i].cells[j].innerHTML+'\n';

        }
    }
    textToSave+='end\n';
    element= document.getElementById('vertexTable');
    for (let i=1;i<element.rows.length;i++){ //Save vertexes
        for (let j=1;j<3;j++){
            textToSave+= element.rows[i].cells[j].innerHTML+'\n';

        }
    }
    textToSave+='end\n';
    element= document.getElementById('circleOfInterest');
    for (let i=2;i<element.rows.length;i++){ //Save circle
        for (let j=0;j<3;j++){
            textToSave+= element.rows[i].cells[j].innerHTML+'\n';

        }
    }
    textToSave+='end\n';
    var listOfAddationalParametersId = ["latitudeResolutionInput","longitudeResolutionInput","altitudeInput",'selectStationList',"polygonCheckBox"]
    for (let i=0;i<listOfAddationalParametersId.length;i++){ //Save parameters
        element= document.getElementById(listOfAddationalParametersId[i]);
        if (i==4) textToSave+= element.checked+'\n';
        else textToSave+= element.value+'\n';
    }
    textToSave+='end\n';
    var loc = mapModule.getCenter();//Save pixels
    textToSave+= (loc.latitude.toString().slice(0,7)+'\n');
    textToSave+= (loc.longitude.toString().slice(0,7)+'\n');
    textToSave+='end\n';
    let HDOPPixels= mapModule.getHDOPPixels();
    let HDOPValues= mapModule.getHDOPValues();
    for (let i=0;i<HDOPPixels.length;++i){
        let locs = HDOPPixels[i].getLocations();
        for (let j=0;j<4;++j){
            let lat = locs[j].latitude.toString().slice(0,7);
            let lon = locs[j].longitude.toString().slice(0,7);
            textToSave+=(lat +'\n'+lon +'\n');
        }
        textToSave+=(HDOPValues[i].toString().slice(0,7)+'\n');
    }
    textToSave+='end';
    return textToSave;
}
// onload

function GetMap2() // DO NOT DELETE, IT IS USED BY BING MAP API
{
    mapModule.setMap('placeholder'); //It should be reference to Map object. I set placeholder so system knows it will be loaded after key is checked
    window.api.send("toMain", ['checkKey']); // Check key
}

function GetMap(){
    // This function is used to create a BingMap
    window.api.send("toMain", ['setMenu']); // Send information to main process that it renderer wants a top menu
    try {
        var map = new Microsoft.Maps.Map('#myMap') //Loads bing map
    }
    catch (e){
        alert('There was a problem with connection. Try again later.');
        window.api.send("toMain", ['exit']);
    }
    let checkbox = document.getElementById("polygonCheckBox");
    togglePolygon(checkbox);
    mapModule.setMap(map); // Set refernce to map in map module
    // Setting addational functions and IDs which will be used by map Module
    mapModule.setOutputId('HDOPInput');
    mapModule.setClearFunction(restoreVisuals);
    mapModule.setBlockFunction(hideVisuals)
    createGradientDiv(); // adding gradient legend (examples of colors which change slowly)
    window.api.send("toMain", ['firstRun']); // check if first run
}

function checkConnection() //it checks connection by checking if map is loaded.
{
    if (!mapModule.checkIfMapIsSet()) {
        alert('There was a problem with connection. Try again later.')
        window.api.send("toMain", ['exit']);
    }
}

function createGradientDiv(){ // adding gradient legend (examples of colors which change slowly)
    var motherDiv = document.getElementById('gradientDiv');
    // edge cases of gradient
    var min = "00FF00";
    var half = "0000FF";
    var max = "FF0000";
    // All colors of gradient
    var colors = generateColor(half,min,15);
    colors = colors.concat(generateColor(max,half,15));
    // Show legend for number values
    for (let i=0;i<30;++i){
        let innerDiv = document.createElement('div');
        innerDiv.innerHTML = i+1;
        innerDiv.style.backgroundColor='#'+colors[i];
        innerDiv.style.float='left';
        innerDiv.style.width = '3%';
        innerDiv.style.textAlign = 'center';
        motherDiv.appendChild(innerDiv);
    }
    // Show that higher values are represented by black
    let innerDiv = document.createElement('div');
    innerDiv.innerHTML = '<';
    innerDiv.style.backgroundColor='black';
    innerDiv.style.color='white';

    innerDiv.style.float='left';
    innerDiv.style.width = '3%';
    innerDiv.style.textAlign = 'center';
    motherDiv.appendChild(innerDiv);
}

// button function

function stopComputation(){
    // This function is used to stop calculating HDOP by main process
    window.api.send("toMain", ['Stop']);
}
function calculateHDOP(){
    // This function is called when user wants to compute HDOP. IF the inputs are fine, it will sne da request to
    // main process to do so and show panel
    let lat = document.getElementById('latitudeResolutionInput').value;
    let lon =document.getElementById('longitudeResolutionInput').value;
    let alt = document.getElementById('altitudeInput').value
    if (!doesArrayContainOnlyNumbers([lat,lon,alt])){
        alert('The inputs must be numeric');
        return null;
    }
    let result= mapModule.calculateHDOP( parseFloat(lat),
        parseFloat(lon),
        parseFloat(alt),
        document.getElementById('selectStationList').value,
        !document.getElementById('polygonCheckBox').checked,4)
    if (result!=null) document.getElementById('PanelHDOP').style.display = "block";
}

function addEventToMap(whichTable){ // add event which happens when user click on the map.
    if (whichTable==="Station") mapModule.addHandlerMap('click', function (e) { addNewStation(e); });
    if (whichTable==="Vertex") mapModule.addHandlerMap('click', function (e) { addNewVertex(e); });
    if (whichTable==="Circle") mapModule.addHandlerMap('click', function (e) { addNewCircle(e); });
}

function addNewVertex(e){
    // This function is used as event or when vertex is adde by form. When user clicks on a Bing map, it adds new vertex based on the inputs from GUI
    // It also adds new row to vertex table
    if (e != null) { //if clicked on the map
        var point = new Microsoft.Maps.Point(e.getX(), e.getY());
        var loc = e.target.tryPixelToLocation(point);
        var lat = loc.latitude.toString().slice(0,7);
        var lon = loc.longitude.toString().slice(0,7);
        mapModule.deleteHandler('click');
    }
    else { //if position typed
        var lat = document.getElementById('latInputPopUp').value;
        lat = parseFloat(lat);
        var lon = document.getElementById('longInputPopUp').value;
        lon = parseFloat(lon);
        if (!doesArrayContainOnlyNumbers([lat,lon])){
            alert('The inputs must be numeric');
            return null;
        }
        loc = new Microsoft.Maps.Location(lat,lon);
    }
    let isSmartPlacing = document.getElementById('smartPlacingVertexesCheckBox').checked;
    let index = mapModule.addVertex(loc,changeVertexInTable,isSmartPlacing);
    var content = [index+1,lat,lon ] ;
    addNewRowToTable("vertexTable",index+1,content,
    '<button type="button" onclick=editRowAndUpdateTable(this,"Vertex") class="buttonSkip fullWidth">Apply</button>',
        '<button type="button" onclick=deleteRowAndUpdateTable(this,"Vertex") class="buttonSkip fullWidth">Delete</button>',
        ['<button type="button" onclick=moveVertexLeft(this,"Vertex") class="buttonSkip ">L</button>',
            '<button type="button" onclick=moveVertexRight(this,"Vertex") class="buttonSkip ">R</button>']);
    hideMassageWindow('lat_lon_alt');
    updateOrderNumberOfTable("vertexTable",1)
}

function moveVertexLeft(cell){ //swap order number of polygon vertex with previous vertex
    var row = cell.parentNode.parentNode,
        sibling = row.previousElementSibling,
        parent = row.parentNode;
    if (row.rowIndex<2) return null; // If to much on the left side, do move further
    mapModule.swapVertexes(row.rowIndex-2,row.rowIndex-1);
    parent.insertBefore(row, sibling);
    updateOrderNumberOfTable("vertexTable",1)
}

function moveVertexRight(cell){ //swap order number of polygon vertex with next vertex
    var row = cell.parentNode.parentNode,
        sibling = row.nextSibling,
        parent = row.parentNode;
    if (row.rowIndex==(parent.rows.length-1)) return null; // If to much on the right side, do move further
    mapModule.swapVertexes(row.rowIndex-1,row.rowIndex);
    parent.insertBefore(sibling,row);
    updateOrderNumberOfTable("vertexTable",1)
}

function updateOrderNumberOfTable(tableId,offset){ //change order value of table's rows
    let table = document.getElementById(tableId);
    for (let i=offset;i<table.rows.length;++i){
        table.rows[i].cells[0].innerHTML = (i-offset+1);
    }
}

function addNewCircle(e){
    // This function is used as event or when position of cricle is typed. When user clicks on a Bing map, it adds new circle based on the inputs from GUI
    // It also resets circle table
    if (e != null) {//if clicked on the map
        var point = new Microsoft.Maps.Point(e.getX(), e.getY());
        var loc = e.target.tryPixelToLocation(point);
        var lat = loc.latitude.toString().slice(0,7);
        var lon = loc.longitude.toString().slice(0,7);
        mapModule.deleteHandler('click');
        document.getElementById('PanelHDOP').style.display = "none";
    }
    else {//if typed
        var lat = document.getElementById('latInputPopUp').value;
        lat = parseFloat(lat);
        var lon = document.getElementById('longInputPopUp').value;
        lon = parseFloat(lon);
        loc = new Microsoft.Maps.Location(lat,lon);
    }
    mapModule.addCircle(loc,2000,changeCircleInTable);
    var table = document.getElementById("circleOfInterest");
    var newRow = table.rows.length;
    var content = [lat,lon ,2000] ;
    addNewRowToTable("circleOfInterest",newRow,content,
        '<button type="button" onclick=editRowAndUpdateTable(this,"Circle") class="buttonSkip fullWidth">Apply</button>',
        '<button type="button" onclick=deleteRowAndUpdateTable(this,"Circle") class="buttonSkip fullWidth">Delete</button>',null);
    hideMassageWindow('lat_lon_alt');
    if (newRow>2) table.rows[3].parentNode.removeChild(table.rows[2]);
}

function addNewStation(e){
    // This function is used as event or when position of new station is typed. When user clicks on a Bing map, it adds new circle based on the inputs from GUI
    // It also resets circle table
    if (e != null) {//if clicked on the map
        var point = new Microsoft.Maps.Point(e.getX(), e.getY());
        var loc = e.target.tryPixelToLocation(point);
        var lat = loc.latitude.toString().slice(0,7);
        var lon = loc.longitude.toString().slice(0,7);
        var alt = 0;
        mapModule.deleteHandler('click');
    }
    else {//if typed
        var lat = document.getElementById('latInputPopUp').value;
        lat = parseFloat(lat);
        var lon = document.getElementById('longInputPopUp').value;
        lon = parseFloat(lon);
        var alt = document.getElementById('altInputPopUp').value;
        alt = parseFloat(alt);
        if (!doesArrayContainOnlyNumbers([lat,lon,alt])){
            alert('The inputs must be numeric');
            return null;
        }
        loc =new Microsoft.Maps.Location(lat,lon);
    }
    mapModule.addStation(loc,alt,'Station',changeStationInTable)
    var table = document.getElementById("stationTable");
    var newRow = table.rows.length;
    var content = [newRow,lat,lon,alt ,"Station"] ;
    addNewRowToTable("stationTable",newRow,content,
        '<button type="button" onclick=editRowAndUpdateTable(this,"station") class="buttonSkip fullWidth">Apply</button>',
        '<button type="button" onclick=deleteRowAndUpdateTable(this,"station") class="buttonSkip fullWidth">Delete</button>',
        '<input type="checkbox" onchange="changeStateofStation(this)" id="scales" name="scales" checked>');
    hideMassageWindow('lat_lon_alt');
    addStationToList();
}

function changeStateofStation(checker){ //If user deactived/activated station
    var state = checker.checked;
    var row = checker.parentNode.parentNode;
    var index = row.cells[0].innerHTML-1;
    mapModule.changeStateOfStation(index,state);
    if (state) addStationToList(); //remove station from comboBox with stations
    else removeStationFromList();
}

// table support functions

function addNewRowToTable(idOfTable,indexOfRow,content,buttonDescriptionEdit,buttonDescriptionDelete,addationalDescription) {
    /*
        string idOfTable
        int indexOfRow
        string[?] content
        string buttonDescriptionEdit
        string buttonDescriptionDelete
        string addationalDescription
        This function adds new row for a chosen table. The content has ifnromation what needs to be added to each row.
        buttonDescriptionEdit and buttonDescriptionDelete has html code of buttons which are going to be create in the table.
        Some tables needs addational special inputs which are decribed in addationalDescription

     */
    var table = document.getElementById(idOfTable);
    var row = table.insertRow(indexOfRow);
    var cell;
    for (var i = 0; i < content.length; ++i) {
        cell = row.insertCell(i);
        cell.innerHTML = content[i];
        cell.type = "number";
        if ((i>0)||(idOfTable==='circleOfInterest')) cell.contentEditable = true;
    }
    if (addationalDescription==null) {
        cell = row.insertCell(content.length);
        cell.innerHTML = buttonDescriptionEdit;
        cell = row.insertCell(content.length + 1);
        cell.innerHTML = buttonDescriptionDelete;
    } else{
        if (idOfTable== 'stationTable') {
            cell = row.insertCell(content.length);
            cell.innerHTML = addationalDescription;
            cell = row.insertCell(content.length + 1);
            cell.innerHTML = buttonDescriptionEdit;
            cell = row.insertCell(content.length + 2);
            cell.innerHTML = buttonDescriptionDelete;
        } else if (idOfTable== 'vertexTable'){
            cell = row.insertCell(content.length);
            cell.innerHTML = buttonDescriptionEdit;
            cell = row.insertCell(content.length + 1);
            cell.innerHTML = buttonDescriptionDelete;
            cell = row.insertCell(content.length + 2);
            cell.innerHTML = addationalDescription[0]+addationalDescription[1];
        }
    }
}

function changeVertexInTable(e){
    // Event function which is called when position of vertex is changed. It updates table
    var pin = e.target;
    var loc = pin.getLocation();
    var index = mapModule.getIndexOfVertex(pin);
    var table = document.getElementById("vertexTable");
    var row = table.rows[index+1];
    row.cells[1].innerHTML = loc.latitude.toString().slice(0,7);
    row.cells[2].innerHTML = loc.longitude.toString().slice(0,7);
}

function changeStationInTable(e){
    // Event function which is called when position of station is changed. It updates table
    var pin = e.target;
    var loc = pin.getLocation();
    var index = mapModule.getIndexOfStation(pin);
    var table = document.getElementById("stationTable");
    var row = table.rows[index+1];
    row.cells[1].innerHTML = loc.latitude.toString().slice(0,7);
    row.cells[2].innerHTML = loc.longitude.toString().slice(0,7);
}

function changeCircleInTable(e){
    // Event function which is called when position of circle is changed. It updates table
    var pin = e.target;
    var loc = pin.getLocation();
    var table = document.getElementById("circleOfInterest");
    var row = table.rows[2];
    row.cells[0].innerHTML = loc.latitude.toString().slice(0,7);
    row.cells[1].innerHTML = loc.longitude.toString().slice(0,7);
}

function deleteRowAndUpdateTable(cell,tableName){
    // This function is used to delete row from table
    // if tableName (string) is station, it deletes station from combobox also
    var tableId = cell.parentNode.parentNode.parentNode.parentNode.id
    var table = document.getElementById(tableId);
    var row = cell.parentNode.parentNode
    row.parentNode.removeChild(row);
    if (tableId === "circleOfInterest") {
        deletePin(null,tableId);
        return null;
    }
    var numberOfRows = table.rows.length;
    var flag = true;

    for (var i = 1;i<numberOfRows;++i)
    {
        cell = table.rows[i].cells[0];
        if ((flag) && (cell.innerHTML == (i+1))){
            flag = false;
            deletePin(i-1,tableId);
        }
        cell.innerHTML = i;

    }

    if (flag) deletePin(numberOfRows-1,tableId);
    if (tableName==='station') if (row.cells[5].firstChild.checked) removeStationFromList();
}

function editRowAndUpdateTable(cell){
    // This function is used when row is edited, it updates table and map
    var tableId = cell.parentNode.parentNode.parentNode.parentNode.id
    var row = cell.parentNode.parentNode;
    if (tableId==="circleOfInterest"){
        var lat = row.cells[0].innerHTML;
        var lon = row.cells[1].innerHTML;
        var radius = row.cells[2].innerHTML;
        if (!doesArrayContainOnlyNumbers([lat,lon,radius])){
            alert('The inputs must be numeric');
            return null;
        }
        var loc = new Microsoft.Maps.Location(parseFloat(lat),parseFloat(lon));
        mapModule.addCircle(loc,radius,changeCircleInTable);
        document.getElementById('PanelHDOP').style.display = "none";
        return null;
    }
    var index = row.cells[0].innerHTML-1;
    var lat = row.cells[1].innerHTML;
    var lon = row.cells[2].innerHTML;
    if (tableId!="vertexTable") var alt = row.cells[3].innerHTML;
    else var alt = 0;
    if (!doesArrayContainOnlyNumbers([lat,lon,alt])){
        alert('The inputs must be numeric');
        return null;
    }
    var name = row.cells[4].textContent;
    var loc = new Microsoft.Maps.Location(parseFloat(lat),parseFloat(lon));
    editPin(loc,index,tableId,alt,name);
}

// List support functions

function addStationToList(){
    // This function adds new station to combobox
    var list= document.getElementById("selectStationList");
    var opt = document.createElement('option');
    opt.value = list.length;
    opt.innerHTML = list.length;
    list.appendChild(opt);
    if (list.value == 0) list.value=1;
}

function removeStationFromList(){
    // This function removes station to combobox
    var list= document.getElementById("selectStationList");
    list.remove(list.length-1);
}

// Pin functions

function deletePin(index,tableId){
    // This function deletes pushpin from map
    if (tableId==="stationTable") mapModule.deleteStation(index);
    if (tableId==="vertexTable") mapModule.deleteVertex(index);
    if (tableId==="circleOfInterest") {document.getElementById('PanelHDOP').style.display = "none";mapModule.deleteCircle();}

}

function editPin(loc,index,tableId,alt,name){
    // This function edits pushpin's position from map
    if (tableId==="stationTable") mapModule.EditStation(loc,parseFloat(alt),index,name,changeStationInTable);
    if (tableId==="vertexTable") mapModule.EditVertex(loc,index,changeVertexInTable);

}

// visuals functions

function restoreVisuals(){
    // This function restores visuals after computing HDOP
    hideDiv('blocker');
    hideDiv('stopButton');
}

function hideVisuals(){
    // This function hides visuals during computing HDOP
    showDiv('blocker');
    showDiv('stopButton');
}

function hideDiv(divId) {
    // this function hides div based on id (string)
    document.getElementById(divId).style.display = "none";
}

function showDiv(divId) {
    // this function shows div based on id (string)
    document.getElementById(divId).style.display = "block";
}

function showMassageWindow(whichControlsShow,whichButtonShow) {
    /*
        string whichControlsShow ->depending on this string controls to type inputs are created
        string whichButtonShow ->depending on this string function decides which input should show up
        This function shows window when user can type location of new pushpin
     */

    if (whichButtonShow === "Vertex") showDiv("addVertexButton");
    else hideDiv("addVertexButton");
    if (whichButtonShow === "Station") showDiv("addStationButton");
    else hideDiv("addStationButton");

    if (whichControlsShow.includes("lat")) showDiv("latInputPopUpDiv");
    else hideDiv("latInputPopUpDiv");
    if (whichControlsShow.includes("long")) showDiv("longInputPopUpDiv");
    else hideDiv("longInputPopUpDiv");
    if (whichControlsShow.includes("alt")) showDiv("altInputPopUpDiv");
    else hideDiv("altInputPopUpDiv");
    showDiv('popUp');
}

function hideMassageWindow(whichDivsHide) {
    // This function shows window when user can type location of new pushpin
    if (whichDivsHide.includes("lat")) hideDiv("latInputPopUpDiv");
    if (whichDivsHide.includes("long")) hideDiv("longInputPopUpDiv");
    if (whichDivsHide.includes("alt")) hideDiv("altInputPopUpDiv");
    hideDiv('popUp');
}

function getLocalizationMeasurmentError(){
    // This function is used to compute and show measurement error based on HDOP
    var t_measurment_error = parseFloat(document.getElementById('stationMeasurmentErrorInput').value);
    var HDOP = parseFloat(document.getElementById('HDOPInput').value);
    var localization_error = t_measurment_error*HDOP*0.3;
    var out = document.getElementById('localizationMeasurmentErrorInput');
    out.value = localization_error.toString().slice(0,7);
}

function toggle(divId,button){
    // This function hides/show chosen div based in divID (string) and change button name (adds hide or show at the end of it)
    if (button.innerHTML.slice(button.innerHTML.length-4,button.innerHTML.length)==='hide') button.innerHTML = button.innerHTML.slice(0,button.innerHTML.length-4)+'show';
    else button.innerHTML = button.innerHTML.slice(0,button.innerHTML.length-4)+'hide';
    $('#'+divId).slideToggle("slow");
}

function togglePolygon(checkBox){
    // If checkBox checked, the map and table hide circle on interest and show polygon of interest
    // oterwise, the map and table show circle on interest and hide polygon of interest
    if (checkBox.checked){
        document.getElementById("smartPlacingVertexesCheckBoxDiv").style.display='block';
        var button = document.getElementById("polygonShowingTableButton");
        button.innerHTML = button.innerHTML.slice(0,button.innerHTML.length-4)+'show';
        button = document.getElementById("circleShowingTableButton")
        button.innerHTML = button.innerHTML.slice(0,button.innerHTML.length-4)+'show';
        $('#'+"circleOfInterestDiv").slideUp("slow");
        $('#'+"circleOfInterestHideDiv").slideUp("slow");
        $('#'+"polygonOfInterestHideButton").slideDown("slow");
        mapModule.vertexPolygonVisibility(true);
        mapModule.circlePolygonVisibility(false);
    } else {
        document.getElementById("smartPlacingVertexesCheckBoxDiv").style.display='none';
        $('#'+"circleOfInterestHideDiv").slideDown("slow");
        $('#'+"polygonOfInterestDiv").slideUp("slow");
        $('#'+"polygonOfInterestHideButton").slideUp("slow");
        mapModule.vertexPolygonVisibility(false);
        mapModule.circlePolygonVisibility(true);
    }
}
// math functions

function doesArrayContainOnlyNumbers(arr){
    // This function checks if all elements of array are unbmers, return bool
    for (var i=0;i<arr.length;++i) if (isNaN(arr[i])) return false;
    return true;
}
