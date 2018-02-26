var express = require("express");
var forceSSL = require('express-force-ssl');
//var http = require("http");
var http = require("https");

var bodyParser = require("body-parser");
const util = require("util");
var fs = require("fs");
var cors = require("cors");
const uuidv1 = require('uuid/v1');
var resp = null;
var resbody = null;
var app = express();
var moment = require('moment-timezone');
var firebase = require("firebase");
var newChatKey = 0;
var config = {
  apiKey: "AIzaSyBMmfTKrvmTJiEIbv381OgKRbTvsqR3qXA",
  authDomain: "sensisaskyellow.firebaseapp.com",
  databaseURL: "https://sensisaskyellow.firebaseio.com",
  projectId: "sensisaskyellow",
  storageBucket: "sensisaskyellow.appspot.com",
  messagingSenderId: "1027498582911"
};
firebase.initializeApp(config);

var forceSsl = function (req, res, next) {
   if (req.headers['x-forwarded-proto'] !== 'https') {
       return res.redirect(['https://', req.get('Host'), req.url].join(''));
   }
   return next();
};

app.use(forceSsl);

var database = firebase.database();
//to create the conversation in Firebase
app.set("port", process.env.PORT || 5000);
//app.set("port", 443);

app.use(express.static(__dirname + "/public"));
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(cors());
//app.use(forceSSL);
// views is directory for all template files
app.set("views", __dirname + "/views");
app.set("view engine", "ejs");

//this is the for health check!!!
app.get("/", function(request, response) {
  response.render("pages/index");
});

app.listen(app.get("port"), function() {
   console.log("Node app is running on port", app.get("port"));
});


//options = {secureOptions: require('constants').SSL_OP_NO_TLSv1};
//http.createServer(options, app).listen(app.get("port")).on('error',function(err){console.log('error!!!')});

// app.use(function(req, res, next) {
//   console.log(req.protocol);
//     if(req.protocol !== 'https') {
//         return res.status(403).send({message: 'SSL required'});
//     }
//     // allow the request to continue
//     next();
// });

/*Query interface to handle read request*/
app.post("/createconversation", function(req, res) {
  var accesstoken = req.get('x-sensis-chat-src');
  if (accesstoken !== 'sensis08f48f202b0f3b64466a91a7db72784480'){//this is the valid token defined by Sam!!!
    return res.status(401).send({"error":"unauthorized access"});
  }

  newChatKey=0;

  //object
  var now = Date.now();
  var consumerObj = {
    consumerNickName: req.body.consumerNickName,
    consumerEmailAddress: req.body.consumerEmailAddress,
    customer:{
        advertiserId: req.body.advertiserId,
        businessName: req.body.businessName,
        businessEmail: req.body.businessEmail,
        businessAddress: req.body.businessAddress,
        businessListingId: req.body.businessListingId,
        businessMobileNumber: req.body.businessMobileNumber||'',
        busNumReviews: req.body.busNumReviews,
        businessRating: req.body.businessRating,
        pmbFlag: req.body.pmbFlag,
        bppURL: req.body.bppURL
    },
    conversation:{},
    lastUpdateFromConsumer: now
  };

//  consumerObj.conversation[uuidv1()] = {
  consumerObj.conversation['DONOTRENDERME'] = {
    name:req.body.businessName,
    text:"Your query to " + req.body.businessName + " has been sent to the business owner and you will get email notification when there is any response from the business owner.",
    from:"customer",
    timestamp:now
  };

  resp = res;
  resbody = {};

  console.log('====Request to create a conversation=====');
  var emailUniqueKey = consumerObj.consumerEmailAddress.replace(/\./g,'__dot__');
  checkIfConsumerEntryExist(emailUniqueKey, consumerObj);
  checkIfCustomerEntryExist(consumerObj.customer.advertiserId, consumerObj);
});

function checkIfConsumerEntryExist(consumerKey, conversationData){
  database.ref('/').child('consumers').equalTo(consumerKey).once('value',function(snapshot){
    if(snapshot.val() == null){
      console.log('No key detected, to create the consumer entry');
      createConsumer(conversationData);
    }
    else{
      console.log("consumer key detected!!!!!");//to create the conversation directly under consumer subtree
      addConsumerConversation(conversationData);
    }
  });
}

function checkIfCustomerEntryExist(customerKey, conversationData){
  database.ref('/').child('customers').equalTo(customerKey).once('value',function(snapshot){
    if(snapshot.val() == null){
      console.log('No key detected, to create the customer entry');
      createCustomer(conversationData);
    }
    else{
      console.log("customer key detected!!!!!");//to create the conversation directly under consumer subtree
//      addCustomerConversation(conversationData);
    }
  });
}

function createConsumer(conversationData){
  //TODO:
  var consumerDBRef = database.ref('consumers/' + conversationData.consumerEmailAddress.replace(/\./g,'__dot__'));
  consumerDBRef.update({nickname:conversationData.consumerNickName});
  addConsumerConversation(conversationData);
  }

function createCustomer(conversationData){
  //TODO:
  addCustomerConversation(conversationData);
}

function addConsumerConversation(conversationData){
  var consumerDBRef = database.ref('consumers/' + conversationData.consumerEmailAddress.replace(/\./g,'__dot__') + '/chats');
  newChatKey = consumerDBRef.push().key;
  //var updates = {};
  //updates[newChatKey] = conversationData;
  //DO NOT include any data not necessary
  //updates[newChatKey] = {
  var updates ={
    conversation:conversationData.conversation,
    customer:conversationData.customer,
    lastUpdateFromConsumer:conversationData.lastUpdateFromConsumer,
    conversationCreatedTime:conversationData.lastUpdateFromConsumer
  };
  //consumerDBRef.update(updates);
  consumerDBRef.child(newChatKey).update(updates);
  //now trigger the email to consumer
  //now send the response to consumer
  var consumerresponsebody = {};
  consumerresponsebody['consumertoken'] = new Buffer(conversationData.consumerEmailAddress.replace(/\./g,'__dot__') + '/chats/' + newChatKey).toString('base64');

  triggerConsumerEmail(conversationData.consumerNickName, conversationData.consumerEmailAddress,conversationData.customer.businessName, consumerresponsebody['consumertoken']);
  resp.status(200).send(consumerresponsebody);

}

function addCustomerConversation(conversationData){//assume customer/consumer pair has been created already
  console.log('now added the conversation to customer record');
  var customerConversationDBRef = database.ref('customers/' + conversationData.customer.advertiserId + '/' + conversationData.consumerEmailAddress.replace(/\./g,'__dot__'));
  var updates={};
  updates[newChatKey] = {lastUpdateFromCustomer:"NA"};
  updates['nickname'] = conversationData.consumerNickName;

  //customerConversationDBRef.push({something:"123455"});
  customerConversationDBRef.update(updates);

  var consumertoken = new Buffer(conversationData.customer.advertiserId + '/'+conversationData.consumerEmailAddress.replace(/\./g,'__dot__') + '/' + newChatKey).toString('base64');
//  updates[newChatKey] = conversationData;
  //customerConversationDBRef.update(updates);
    //now trigger the email to customer
  triggerCustomerEmail(conversationData.consumerNickName, conversationData.customer.businessEmail , conversationData.customer.businessName, consumertoken);

  //trigger SMS to business if the mobile number is provided
  console.log(conversationData.customer.businessMobileNumber);
  if(conversationData.customer.businessMobileNumber.length >4){
    triggerCustomerSMS(conversationData.consumerNickName, conversationData.customer.businessMobileNumber, consumertoken);
  }

}

function triggerCustomerSMS(nickName, mobilenumber, consumertoken){
  var https = require("https");
  //generate shorten URL firstly
  var options = {
    "method": "POST",
    "hostname": "www.googleapis.com",
    "port": null,
    "path": "/urlshortener/v1/url?key=AIzaSyCtOYrPtm36mStCqHDoKY4yq7eaPR5_LVs",
    "headers": {
      "content-type": "application/json"
    }
  };

  var req = https.request(options, function (res) {
    var chunks = [];

    res.on("data", function (chunk) {
      chunks.push(chunk);
    });

    res.on("end", function () {
//      var urlshortenresultbody = Buffer.concat(chunks);
//      console.log(JSON.parse(urlshortenresultbody.toString()));
      var urlshortenresultbody = JSON.parse(Buffer.concat(chunks).toString())
      console.log(urlshortenresultbody.id)
      //to check if body.id has the shorten URL or not
      //now I got the shorten URL, to send the SMS now!!!!
      //TODO:
var options = {
  "method": "POST",
  "hostname": "damp-retreat-59941.herokuapp.com",
  "port": null,
  "path": "/sendsms",
  "headers": {
    "content-type": "application/json"
  }
};

var req = http.request(options, function (res) {
  var chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function () {
    var body = Buffer.concat(chunks);
    console.log(body.toString());
  });
});
var myMessage = {number: mobilenumber, message: 'You have a yellowpages query at ' + urlshortenresultbody.id};
req.write(JSON.stringify(myMessage));
req.end();

    });
  });

  req.write(JSON.stringify({ longUrl: 'https://www.myaccount.sensis.com.au/myaccount/' + consumertoken }));
  req.end();

}
function triggerConsumerEmail(nickname, email, businessName, token){
  var options = {
    "method": "POST",
    "hostname": "mas-email-sender.herokuapp.com",
    "port": null,
    "path": "/sendemail",
    "headers": {
      "content-type": "application/json"
    }
  };

  var req = http.request(options, function (res) {
    var chunks = [];

    res.on("data", function (chunk) {
      chunks.push(chunk);
    });

    res.on("end", function () {
      var body = Buffer.concat(chunks);
      console.log(body.toString());
    });
  });

//  var conversationtimestring = new Date().toLocaleString();

  var now_utc = Date.now();
  var conversationtimestring = moment(now_utc).tz("Australia/Sydney").format("H:mm D/MM/YYYY");


  var requestBody = {};
  requestBody.email = email;
  requestBody.subject = nickname + '\'s conversation with ' + businessName + ' at ' + conversationtimestring;
  requestBody.message = 'Hi, ' + nickname + ', \nYou have created a conversation with ' + businessName + ' at ' + conversationtimestring + '. You can click this URL ' + 'https://www.yellowpages.com.au/myyellow/' + token + ' to reopen the conversation anytime in the future.\n\n\n This is a system generated email, do not reply to this email. \n Sensis Digital\n';
  //requestBody.html = TBD!!!!
  req.write(JSON.stringify(requestBody));
  req.end();
}

function triggerCustomerEmail(nickname, businessemail, businessName, token){
  var options = {
    "method": "POST",
    "hostname": "mas-email-sender.herokuapp.com",
    "port": null,
    "path": "/sendemail",
    "headers": {
      "content-type": "application/json"
    }
  };

  var req = http.request(options, function (res) {
    var chunks = [];

    res.on("data", function (chunk) {
      chunks.push(chunk);
    });

    res.on("end", function () {
      var body = Buffer.concat(chunks);
      console.log(body.toString());
    });
  });

//  var conversationtimestring = new Date().toLocaleString();
  var now_utc = Date.now();
  var conversationtimestring = moment(now_utc).tz("Australia/Sydney").format("H:mm D/MM/YYYY");

  var requestBody = {};
  requestBody.email = businessemail;
  requestBody.subject =  nickname + '\'s conversation with your business ' + businessName + ' at ' + conversationtimestring;
  requestBody.message = 'Hi, ' + businessName + ', \n' + nickname + ' has initiated a conversation with ' + businessName + ' at ' + conversationtimestring + '. You can click this URL ' + 'https://www.myaccount.sensis.com.au/myaccount/' + token + ' to reopen the conversation anytime in the future. \n\n\n This is a system generated email, do not reply to this email. \n Sensis Digital\n';
  //requestBody.html = TBD!!!!
  req.write(JSON.stringify(requestBody));
  req.end();
}

// var secureServer = http.createServer(app);
// secureServer.listen(app.get("port"));
