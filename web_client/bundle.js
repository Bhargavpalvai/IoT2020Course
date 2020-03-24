(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

/*
 * The awsConfiguration object is used to store the credentials to connect to AWS service.
 * MAKE SHURE to insert the correct name for your endpoint, the correct Cognito PoolID
 * and the correct AWS region.
*/
var awsConfiguration = {
   poolId: 'us-east-1:5ae4946b-fba9-42a3-b03a-8cf97ce235f0',
   host: "a29wnmzjyb35x8-ats.iot.us-east-1.amazonaws.com",
   region: 'us-east-1'
};
module.exports = awsConfiguration;

},{}],2:[function(require,module,exports){

//Loading the AWS SDK and the configuration objects.
var AWS = require('aws-sdk');
var AWSIoTData = require('aws-iot-device-sdk');
var AWSConfiguration = require('./aws-configuration.js');
console.log('Loaded AWS SDK for JavaScript and AWS IoT SDK for Node.js');



//
// Configuration of the AWS SDK.
//

//The id of the MQTT client.
var clientId = 'dashboard-' + (Math.floor((Math.random() * 100000) + 1));

AWS.config.region = AWSConfiguration.region;
AWS.config.credentials = new AWS.CognitoIdentityCredentials({
   IdentityPoolId: AWSConfiguration.poolId
});

//The mqttClient object used for retrieving the messages from the MQTT server.
const mqttClient = AWSIoTData.device({
   region: AWS.config.region, //Set the AWS region we will operate in
   host:AWSConfiguration.host, //Set the AWS IoT Host Endpoint
   clientId: clientId, //The clientId created earlier
   protocol: 'wss', //Connect via secure WebSocket
   maximumReconnectTimeMs: 8000, //Set the maximum reconnect time to 8 seconds
   debug: true, //Enable console debugging information
   accessKeyId: '',
   secretKey: '',
   sessionToken: ''
});

//The cognitoIdentity used for authentication.
var cognitoIdentity = new AWS.CognitoIdentity();
AWS.config.credentials.get(function(err, data) {
   if (!err) {
      console.log('retrieved identity: ' + AWS.config.credentials.identityId);
      var params = {
         IdentityId: AWS.config.credentials.identityId
      };
      cognitoIdentity.getCredentialsForIdentity(params, function(err, data) {
         if (!err) {
            mqttClient.updateWebSocketCredentials(data.Credentials.AccessKeyId,
               data.Credentials.SecretKey,
               data.Credentials.SessionToken);
         } else {
            console.log('error retrieving credentials: ' + err);
            alert('error retrieving credentials: ' + err);
         }
      });
   } else {
      console.log('error retrieving identity:' + err);
      alert('error retrieving identity: ' + err);
   }
});



//
// UI functions.
//

//Function for switching active tab.
window.switchView = function(activate) {
  if (activate=="current-status-link"){
    document.getElementById("current-status-link").className = "active";
    document.getElementById("past-status-link").className = "inactive";
    document.getElementById('current-status-div').style.display = 'block';
    document.getElementById('past-status-div').style.display = 'none';
  } else {
    document.getElementById("current-status-link").className = "inactive";
    document.getElementById("past-status-link").className = "active";
    document.getElementById('current-status-div').style.display = 'none';
    document.getElementById('past-status-div').style.display = 'block';
  }
}



//
// Current status.
//

//The topic where the environmental stations publish the sensors data.
var stationTopic = 'stations/+';

//Variable storing the current status of the stations.
var stationsStatus = {};

//Variable storing the name of the station we are currently displaying.
var currentStation = "";

//Connect handler: once the MQTT client has successfully connected to the MQTT server
//it subscribes to the stationTopic
window.mqttClientConnectHandler = function() {
   console.log('connected to MQTT server');
   mqttClient.subscribe(stationTopic);
   console.log("subscribed to", stationTopic);
};

//Function for updating the table containing the current status of the station.
window.updateInfo = function() {
   var infoTable = document.getElementById("station-info");
   infoTable.rows.item(0).cells.item(1).innerHTML = stationsStatus[currentStation].temperature + " °C";
   infoTable.rows.item(1).cells.item(1).innerHTML = stationsStatus[currentStation].humidity + "%";
   infoTable.rows.item(2).cells.item(1).innerHTML = stationsStatus[currentStation].windDirection  + "°";
   infoTable.rows.item(3).cells.item(1).innerHTML = stationsStatus[currentStation].windIntensity + " m/s";
   infoTable.rows.item(4).cells.item(1).innerHTML = stationsStatus[currentStation].rainHeight + " mm/h";
}

//Message handler: upon receiving a message if it's relative to a new station it adds it to the selection menu
//then it saves it's status in the variable stationsStatus and finally updates the table.
window.mqttClientMessageHandler = function(topic, payload) {
   console.log('message: ' + topic + ':' + payload.toString());
   if (stationsStatus[topic.slice(9)]==undefined) {
     document.getElementById("station-select").innerHTML += '<option value="'+ topic.slice(9) + '">' + topic.slice(9) + '</option>';
   }
   stationsStatus[topic.slice(9)]=JSON.parse(payload.toString());
   if (currentStation!="") updateInfo();
};

//Function for changing the currently displayed station.
window.changeStation = function() {
   currentStation = document.getElementById("station-select").value;
   updateInfo();
}

//Installing the connect and message handlers.
mqttClient.on('connect', window.mqttClientConnectHandler);
mqttClient.on('message', window.mqttClientMessageHandler);


//
// Past status.
//

//DynamoDB service object.
var ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

//List of stations in the database.
var stationsList = new Set();

//Function that // REVIEW: eturns the timestamp of one hour ago.
window.lastHour = function() {
  var d = new Date();
  d.setHours(d.getHours() -1);
  return d.getTime();
}

//Parameters for the scan of the database.
var scanParams = {
  ExpressionAttributeNames:{
      "#id": "id",
      "#time": "timestamp"
  },
  ExpressionAttributeValues: {
      ":lastHour":{N:lastHour().toString()}
  },
  FilterExpression: "#time >= :lastHour",
  ProjectionExpression: '#id',
  TableName: 'EnvironmentalStations'
};

//Scans the table EnvironmentalStations,
//adds the id of the stations in stationsList and in the select menu.
ddb.scan(scanParams, function(err, data) {
  if (err) {
    console.log("Error", err);
  } else {
    data.Items.forEach(function(element) {
      stationsList.add(element.id.S);
    });
    stationsList = Array.from(stationsList);
    stationsList.sort();
    console.log("success", stationsList);
    stationsList.forEach(function(elem, index) {
      document.getElementById("chart-div").innerHTML += "<canvas id='chart" + index + "'></canvas><br>";
    });
  }
});

//Queries the database for the sensor data and draws the charts.
window.refreshSensorChart = function() {
  stationsList.forEach(function(id, index) {
    //Parameters of the query.
    var params = {
      ExpressionAttributeValues: {
          ":station":{S:id},
          ":lastHour":{N:lastHour().toString()}
      },
      ExpressionAttributeNames:{
          "#id": "id",
          "#time": "timestamp"
      },
      KeyConditionExpression: "#id = :station and #time >= :lastHour",
      TableName: 'EnvironmentalStations'
    };

    //Queries the data from the last hour for the selected sensor.
    ddb.query(params, function(err, data) {
      if (err) {
        console.log("Error", err);
      } else {
        console.log("success", data);

        var time=[];
        var dataset=[];

        data.Items.forEach(function(element) {
          var d = new Date();
          d.setTime(element.timestamp.N);
          time.push(d);
          var sensor = document.getElementById("sensor-select").value;
          dataset.push(element.payload.M[sensor].S);
        });

        //Draws the chart.
        let chart = new Chart(document.getElementById('chart'+index).getContext('2d'), {
          "type": "line",
          "data": {
            "labels": time,
            "datasets": [{
              "label": id,
              "data": dataset,
              "fill": false,
              "borderColor": 'rgb(255, 0, 0)',
              "lineTension": 0.1
            }]
          },
          "options": {
            responsive: true,
            scales: {
              xAxes: [{
                type: 'time',
                time: {
                  unit: 'minute',
                  stepSize: 10
                }
              }]
            }
          }
        });
      }
    });
  });
}

},{"./aws-configuration.js":1,"aws-iot-device-sdk":"aws-iot-device-sdk","aws-sdk":"aws-sdk"}]},{},[2]);
