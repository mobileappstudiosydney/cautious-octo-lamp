'use strict';

var ayChatContainer = {
  ayIsConsumer: true,
  ayConversationId: null,
  ayConversationToken: null,
  ayParentDiv: null,
  ayChatHistory: [],
  ayConvDBRef: null,
  ayCId: null,
  ayAdvId: null,
  ayAdvertiser: null,
  ayHistoryCount: 0,
  ayHistorySubscriptions: [],

  ayIsValid: function(variable) {
      return (typeof(variable) !== 'undefined' && variable !== null);
  },

  ayInitMessagingContainer: function(token, divId) {
    this.ayConversationToken = token;
    this.ayParentDiv = divId;

    $('#' + this.ayParentDiv).append(this.ayLoadingDiv);

    this.ayGetConversationId();

    if (firebase !== null) {
      var config = {
        databaseURL: "https://sensisaskyellow.firebaseio.com",
        projectId: "sensisaskyellow",
        storageBucket: "sensisaskyellow.appspot.com",
      };
      firebase.initializeApp(config);

      this.ayIsConsumer ? this.ayFetchConsumerMessageHistory() : this.ayFetchAdvertiserMessageHistory();
    }
  },

  ayAddElement: function(parentId, elementTag, elementId, html) {
      var p = document.getElementById(parentId);
      if (p !== null) {
          var newElement = document.createElement(elementTag);
          if (elementId !== null) {
            newElement.setAttribute('id', elementId);
          }
          newElement.innerHTML = html;
          p.appendChild(newElement);
      }
  },

  ayRemoveElement: function(elementId) {
      var element = document.getElementById(elementId);
      if (element !== null) {
          element.parentNode.removeChild(element);
      }
  },

  ayFetchConsumerMessageHistory: function() {
    var path = "/consumers/" + this.ayCId;

    return firebase.database().ref(path).once('value').then(function(snapshot) {
      if (snapshot !== null && snapshot.val() !== null) {
        var data = snapshot.val();
        this.ayAppendChatHistory(data['nickname'], data['chats']);

        // this.ayRenderHistoryView();
      }
    }.bind(this));
  },

  ayOnClickViewMessage: function(historyId) {
    if (this.ayConversationId !== historyId) {
      $('#' + this.ayConversationId).removeClass('ay-active');
      this.ayConversationId = historyId;
      $('#' + historyId).addClass('ay-active');

      this.aySwitchConversation();
    }
    $('.ay-messages').addClass('ay-conversation-selected');
    this.ayScrollToBottomOfConversationHistory();
  },

  ayOnClickSend: function() {
    var ayMsg = $("#ayTextArea").val();
    $("#ayTextArea").val('');
    $("#aySubmitButton").removeClass("ay-active");

    this.aySendMessage(ayMsg);
  },

  ayAppendChatHistory: function(nickname, history) {
    if (history !== null) {
      var keys = Object.keys(history);
      var pendingCalls = keys.length;
      keys.forEach(function(key) {
        var obj = history[key];
        obj['key'] = key;
        obj['nickname'] = nickname;
        obj['lastUpdateFromCustomer'] = 0;  //default
        this.ayChatHistory.push(obj);

        var path = "/customers/" + obj['customer']['advertiserId'] + '/' + this.ayCId + '/' + key;
        return firebase.database().ref(path).once('value').then(function(snapshot) {
          if (snapshot !== null && snapshot.val() !== null) {
            var index = this.ayFindChatHistoryIndex(key);
            if (index !== -1) {
              this.ayChatHistory[index]['lastUpdateFromCustomer'] = snapshot.val()['lastUpdateFromCustomer'];
            }
          }
          pendingCalls--;
          if (pendingCalls < 1) {
            this.ayRenderHistoryView();
          }
        }.bind(this));
      }.bind(this));
    }
  },

  ayReloadConversationHistory: function() {
    //Clear listeners
    Object.keys(this.ayHistorySubscriptions).forEach(function(subscriptionKey) {
      this.ayHistorySubscriptions[subscriptionKey].off();
    }.bind(this));
    this.ayHistorySubscriptions = [];

    $('#ayHistoryListView').empty();

    this.aySortHistory();

    for (var i = 0; i < this.ayChatHistory.length; i++) {
      var ayHistory = this.ayChatHistory[i];

      var ayHDiv = this.ayGenerateHistoricalDiv(ayHistory);

      $('#ayHistoryListView').append(ayHDiv);

      //Subscribe to events
      if (this.ayIsConsumer) {
        var path = '/customers/' + ayHistory.customer.advertiserId + '/' + this.ayCId + '/' + ayHistory.key + '/lastUpdateFromCustomer';
      } else {
        var path = '/consumers/' + this.ayCId + '/chats/' + ayHistory.key + '/lastUpdateFromConsumer';
      }
      var ref = firebase.database().ref(path);
      this.ayHistorySubscriptions[ayHistory.key] = ref;
      ref.on('value', function(snapshot) {
        if (snapshot.val() !== null) {
          var subPath = snapshot.ref.parent.path.toString();
          var updateForConsumer = subPath.startsWith('/customers/');
          var ary = subPath.split('/');
          if (ary.length > 4) {
            var cKey = ary[4];
            var history = this.ayFindChatHistory(cKey);
            if (history != null
              && ((updateForConsumer && history.lastUpdateFromCustomer !== snapshot.val())
                || (!updateForConsumer && history.lastUpdateFromConsumer !== snapshot.val()))) {
              var index = this.ayFindChatHistoryIndex(cKey);
              if (index > -1) {
                this.ayChatHistory.splice(index, 1);
              }

              history[updateForConsumer ? 'lastUpdateFromCustomer' : 'lastUpdateFromConsumer'] = snapshot.val();
              this.ayChatHistory.splice(0, 0, history);

              this.ayUpdateHistoryView(cKey, history);
            }
          }
        }
      }.bind(this));
    }

    var selectedDiv = $('#' + this.ayConversationId);
    if (typeof(selectedDiv) !== 'undefined' && selectedDiv.length > 0) {
      $('#ayHistoryListView')[0].scrollTop = selectedDiv[0].offsetTop-80;
    }
  },

  ayUpdateHistoryView: function(cKey, history) {
    $('#' + cKey).remove();
    var hDiv = this.ayGenerateHistoricalDiv(history);
    $('#ayHistoryListView').prepend(hDiv);
  },

  ayGenerateHistoricalDiv: function(ayHistory) {
    var ayHDiv = this.ayHistoryDiv;
    var lastUpdateCustomer = isNaN(ayHistory.lastUpdateFromCustomer) ? 1 : ayHistory.lastUpdateFromCustomer;
    var lastUpdateConsumer = isNaN(ayHistory.lastUpdateFromConsumer) ? 1 : ayHistory.lastUpdateFromConsumer;
    var latUpdatedAt = lastUpdateCustomer > lastUpdateConsumer ? lastUpdateCustomer : lastUpdateConsumer;
    if (this.ayIsConsumer) {
      ayHDiv = ayHDiv.replace('{RATINGS_PLACEHOLDER}', this.ayRatingsDiv);
      ayHDiv = ayHDiv.replace('{BUSINESS_NAME}', ayHistory.customer.businessName);
      if (ayHistory.customer.pmbFlag === true) {
        ayHDiv = ayHDiv.replace('<div class="ay-address">', '<div class="ay-address ay-mobile">');
        ayHDiv = ayHDiv.replace('{BUSINESS_ADDRESS}', '\nMobile address');
      } else {
        ayHDiv = ayHDiv.replace('{BUSINESS_ADDRESS}', ayHistory.customer.businessAddress);
      }
      var ayRating = Math.floor(ayHistory.customer.businessRating);
      var ayRatingStr = "''" + ayHistory.customer.businessRating + "''";
      var ayDecimalVal = parseInt(ayRatingStr.split('.')[1]);

      var ayStars = '';
      for (var i = 1; i < 6; i++) {
        if (i <= ayRating) {
          ayStars += '<div class="ay-star ay-full-star"></div>\n';
        } else {
          if (ayDecimalVal >= 5 && i === ayRating+1) {
            ayStars += '<div class="ay-star ay-half-star"></div>\n';
          } else {
            ayStars += '<div class="ay-star"></div>\n';
          }
        }
      }
      ayHDiv = ayHDiv.replace('{RATING_STARS}', ayStars);
      ayHDiv = ayHDiv.replace('{NO_OF_REVIEWS}', ayHistory.customer.busNumReviews);
      ayHDiv = ayHDiv.replace('{MORE_INFO_LINK}', ayHistory.customer.bppURL);
    } else {
      ayHDiv = ayHDiv.replace('{RATINGS_PLACEHOLDER}', '');
      ayHDiv = ayHDiv.replace('{BUSINESS_NAME}', ayHistory.nickname);
      ayHDiv = ayHDiv.replace('{BUSINESS_ADDRESS}', ayHistory.ayCId.replace(/__dot__/g,'.'));
      ayHDiv = ayHDiv.replace('<div class="ay-more-info"> <a href="{MORE_INFO_LINK}" target="_blank">More information</a> </div>', '');
    }

    ayHDiv = ayHDiv.replace('{START_DATE}', this.ayGetDateTime(ayHistory.conversationCreatedTime));
    ayHDiv = ayHDiv.replace('{LAST_UPDATED}', this.ayGetDateTime(latUpdatedAt));
    ayHDiv = ayHDiv.replace('{HISTORY_ID}', ayHistory.key);
    ayHDiv = ayHDiv.replace('{CONVERSATION_ID}', "'" + ayHistory.key + "'");

    if (this.ayConversationId === ayHistory.key) {
      ayHDiv = ayHDiv.replace('"ay-conversation"', '"ay-conversation ay-active"');
    }
    return ayHDiv;
  },

  ayFetchAdvertiserInfo: function() {
    var path = '/consumers/' + token + '/customer/';

    firebase.database().ref(path).once('value').then(function(snapshot) {
      if (snapshot !== null && snapshot.val() !== null) {
        this.ayAdvertiser = snapshot.val();

        this.ayFetchAdvertiserMessageHistory();
      }
    }.bind(this));
  },

  ayFetchAdvertiserMessageHistory: function() {
    var path = '/customers/' + this.ayAdvId + '/';

    firebase.database().ref(path).once('value').then(function(snapshot) {
      if (snapshot !== null && snapshot.val() !== null) {
        var data = snapshot.val();

        this.ayCalculateHistoryCount(data);

        var keys = Object.keys(data);
        if (keys !== null) {
          keys.forEach(function(key) {  //By each consumer id
            var cNickName = data[key]['nickname'];
            var ayConsConvs = data[key];

            var convKeys = Object.keys(ayConsConvs);
            convKeys.forEach(function(convKey) {  //By each conv for a single cust
              if (convKey !== 'nickname') {
                var cPath = "/consumers/" + key + "/chats/" + convKey;

                return firebase.database().ref(cPath).once('value').then(function(snapshot) {
                  if (snapshot !== null && snapshot.val() !== null) {
                    var history = snapshot.val();
                    history['key'] = convKey;
                    history['nickname'] = cNickName;
                    history['ayCId'] = key;
                    history['lastUpdateFromCustomer'] = ayConsConvs[convKey].lastUpdateFromCustomer;
                    this.ayChatHistory.push(history);
                  }

                  this.ayHistoryCount--;
                  if (this.ayHistoryCount < 1) {
                    this.ayRenderHistoryView();
                  }
                }.bind(this));
              }
            }.bind(this));
          }.bind(this));
        }
      }
    }.bind(this));
  },

  ayRenderHistoryView: function() {
    $('#' + this.ayParentDiv).empty();

    var cDiv = this.ayContainerDiv;
    if (this.ayIsConsumer) {
      $('#' + this.ayParentDiv).append(cDiv);
    } else {
      var cDiv = this.ayContainerDiv;
      cDiv = cDiv.replace('<div class="ay-messages ay-conversation-selected">', '<div class="ay-messages ay-advertiser ay-conversation-selected">');
      $('#' + this.ayParentDiv).append(cDiv);
    }

    $("#ayBackLink").on('click', function(e) {
      $('.ay-messages').removeClass('ay-conversation-selected');
    }.bind(this));

    $("#ayTextArea").on('input',function(e){
      if (e.target.value.length > 0) {
        $("#aySubmitButton").addClass("ay-active");
      } else {
        $("#aySubmitButton").removeClass("ay-active");
      }
    }.bind(this));

    this.ayReloadConversationHistory();

    this.aySwitchConversation();
  },

  ayCalculateHistoryCount: function(data) {
    var keys = Object.keys(data);
    if (keys !== null) {
      keys.forEach(function(key) {  //By each consumer id
        var ayConsConvs = data[key];
        var convKeys = Object.keys(ayConsConvs);
        convKeys.forEach(function(convKey) {  //By each conv for a single cust
          if (convKey !== 'nickname') {
            this.ayHistoryCount++;
          }
        }.bind(this));
      }.bind(this));
    }
  },

  aySwitchConversation: function() {
    $('#ayConversationListView').empty();
    var uNickName = '';
    if (this.ayConversationId !== null) {
      if (this.ayChatHistory !== null) {
        var history = this.ayFindChatHistory(this.ayConversationId);
        if (this.ayIsValid(history)) {
          if (!this.ayIsConsumer && history.ayCId !== null) {
            this.ayCId = history.ayCId;
          }

          $('#ayConversationHeader').text(this.ayConvHeader.replace('{BUSINESS_NAME}', history.customer.businessName));
          $('#ayTextArea').attr("placeholder", this.ayTextAreaPlaceHolder.replace('{BUSINESS_NAME}', this.ayIsConsumer ? history.customer.businessName : history.nickname));

          $('#ayFooterMsg').empty();
          var element = document.getElementById("ayFooterMsg");
          var boldElement = document.createElement("b");
          boldElement.appendChild(document.createTextNode(this.ayIsConsumer ? this.ayCId.replace(/__dot__/g,'.') : history.customer.businessEmail));
          element.appendChild(document.createTextNode("We’ve sent an email to you at "));
          element.appendChild(boldElement);
          element.appendChild(document.createTextNode(". You can use the link in the email to get back to this conversation with {BUSINESS_NAME} at anytime.".replace('{BUSINESS_NAME}', this.ayIsConsumer ? history.customer.businessName : history.nickname)));

          $('#ayUserHeader').text((this.ayIsConsumer ? history.nickname : history.customer.businessName) + '’s Messages');
          $('#ayMobileUserHeader').text((this.ayIsConsumer ? history.nickname : history.customer.businessName) + '’s Messages');

          uNickName = history.nickname;

          if (this.ayIsConsumer) {
            this.ayAddAutoReplyMessage(history.customer.businessName); //Default message
          }
        }
      }

      if (this.ayConvDBRef !== null) {
        this.ayConvDBRef.off();  //Detach previous listeners
      }
      this.ayAddCustomerAutoReply = !this.ayIsConsumer;
      this.ayAddConsumerAutoReply = this.ayIsConsumer;
      firebase.database().ref('/consumers/' + this.ayCId + '/chats/' + this.ayConversationId + '/conversation').once('value').then(function(snapshot) {
        if (snapshot !== null && snapshot.val() !== null) {
          if (this.ayIsMessageFromCurrentConversation(snapshot.ref.path.toString())) {
            var ayMessages = snapshot.val();
            var keys = Object.keys(ayMessages);
            var ayMsgArray = [];
            keys.forEach(function(key) {
              var obj = ayMessages[key];
              obj['key'] = key;
              ayMsgArray.push(obj);
            }.bind(this));

            ayMsgArray = this.aySortMessages(ayMsgArray);

            for (var i = 0; i < ayMsgArray.length; i++) {
              var obj = ayMsgArray[i];

              if (obj['key'] === 'DONOTRENDERME') {
                continue; //Skip
              }

              var ayMessage = this.ayMessageDiv;
              ayMessage = ayMessage.replace('{MESSAGE_ID}', obj.timestamp);
              ayMessage = ayMessage.replace('{MESSAGE}', obj.text);
              ayMessage = ayMessage.replace('{CONTENT_TYPE}', obj.from.toLowerCase() === 'consumer' ? "ay-user" : "ay-business");
              $('#ayConversationListView').append(ayMessage);

              if (this.ayAddCustomerAutoReply) {
                if (obj.from.toLowerCase() !== 'consumer') {
                  this.ayAddCustomerAutoReply = false;
                  this.ayAddAutoReplyMessage(uNickName); //Default message
                }
              } else if (this.ayAddConsumerAutoReply) {
                if (obj.from.toLowerCase() === 'consumer') {
                  this.ayAddConsumerAutoReply = false;

                  this.ayAddConsumerAutoReplyMessage(history.customer.businessName);
                }
              }
            }
          }
        }

        this.ayConvDBRef = firebase.database().ref('/consumers/' + this.ayCId + '/chats/' + this.ayConversationId + '/conversation');
        this.ayConvDBRef.on('child_added', function(snapshot) {
          if (snapshot.key === 'DONOTRENDERME') {
            return; //Skip
          }

          var ayMsg = snapshot.val();

          if (this.ayIsMessageFromCurrentConversation(snapshot.ref.path.toString()) && $('#' + ayMsg.timestamp).length === 0) {
            var ayMessage = this.ayMessageDiv;
            ayMessage = ayMessage.replace('{MESSAGE_ID}', ayMsg.timestamp);
            ayMessage = ayMessage.replace('{MESSAGE}', ayMsg.text);
            ayMessage = ayMessage.replace('{CONTENT_TYPE}', ayMsg.from.toLowerCase() === 'consumer' ? "ay-user" : "ay-business");
            $('#ayConversationListView').append(ayMessage);
            this.ayBeep();

            if (this.ayAddCustomerAutoReply && ayMsg.from.toLowerCase() !== 'consumer') {
              this.ayAddCustomerAutoReply = false;
              this.ayAddAutoReplyMessage(uNickName); //Default message

              this.aySendEmailNotification("CONSUMER EMAIL 2"); //Email consumer
            } else if (this.ayAddConsumerAutoReply && ayMsg.from.toLowerCase() === 'consumer') {
              this.ayAddConsumerAutoReply = false;
              this.ayAddConsumerAutoReplyMessage(history.customer.businessName);

              //TODO - Commented out below code to avoid server crashes
              // this.aySendEmailNotification("BUSINESS EMAIL 1"); //Email customer
            }
          }
          //Scroll to bottom of conversation
          this.ayScrollToBottomOfConversationHistory();
        }.bind(this));
      }.bind(this));
    }
  },

  ayScrollToBottomOfConversationHistory: function() {
    var bubblesDiv = $('#ayBubblesContainer');
    if (typeof(bubblesDiv) !== 'undefined' && bubblesDiv.length > 0) {
      if (navigator.userAgent.match(/(iPod|iPhone|iPad|Android)/)) {
        window.scrollTo(0,bubblesDiv[0].scrollHeight);
      } else {
        bubblesDiv[0].scrollTop = bubblesDiv[0].scrollHeight;
      }
    }
  },

  aySendEmailNotification: function(template) {
    var history = this.ayFindChatHistory(this.ayConversationId);
    var email = '';
    var conversationUrl = 'http://localhost/';
    if (history !== null) {
      if (template === 'BUSINESS EMAIL 1') {
        email = history.customer.businessEmail;
        conversationUrl += 'advertiser.html';
        var token = btoa(history.customer.advertiserId + '/' + history.ayCId + '/' + this.ayConversationId);
        conversationUrl += '?token=' + token;
      } else {
        email = this.ayCId.replace(/__dot__/g,'.');
        conversationUrl += 'customer.html';
        var token = btoa(this.ayCId + '/chats/' + this.ayConversationId);
        conversationUrl += '?token=' + token;
      }

      fetch('https://mas-email-sender.herokuapp.com/sendsensisemail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          businessname: history.customer.businessName,
          conversationurl: conversationUrl,
          message: '',
          consumername: history.nickname,
          templatetype: template
        })
      })
      .catch(function(error) {
        console.error('Send email error: ' + error);
      });
    }
  },

  ayAddAutoReplyMessage: function(name) {
    if (this.ayIsConsumer) { //Default message
      var defaultMessage = this.ayMessageDiv;
      defaultMessage = defaultMessage.replace('{MESSAGE_ID}', 'defaultMsg');
      defaultMessage = defaultMessage.replace('{MESSAGE}', this.ayDefaultConsumerMsg.replace('{BUSINESS_NAME}', name));
      defaultMessage = defaultMessage.replace('{CONTENT_TYPE}', "ay-yellow-pages");
      $('#ayConversationListView').append(defaultMessage);
    } else {
      var defaultMessage = this.ayMessageDiv;
      defaultMessage = defaultMessage.replace('{MESSAGE_ID}', 'defaultMsg');
      defaultMessage = defaultMessage.replace('{MESSAGE}', this.ayAdvetiserAutoReply.replace('{CONSUMER_NAME}', name));
      defaultMessage = defaultMessage.replace('{CONTENT_TYPE}', "ay-yellow-pages");
      $('#ayConversationListView').append(defaultMessage);
    }
  },

  ayAddConsumerAutoReplyMessage: function(name) {
    var defaultMessage = this.ayMessageDiv;
    defaultMessage = defaultMessage.replace('{MESSAGE_ID}', 'defaultMsg-2');
    defaultMessage = defaultMessage.replace('{MESSAGE}', this.ayConsumerAutoReply.replace('{BUSINESS_NAME}', name));
    defaultMessage = defaultMessage.replace('{CONTENT_TYPE}', "ay-yellow-pages");
    $('#ayConversationListView').append(defaultMessage);
  },

  aySendMessage: function(userMsg) {
    if (userMsg !== null && userMsg.length > 0) {
      var path = '/consumers/' + this.ayCId + '/chats/' + this.ayConversationId + '/conversation';
      var postTime = this.ayGetCurrentTimestamp();
      var postData = {
        text: userMsg,
        from: this.ayIsConsumer ? "consumer" : "customer",
        timestamp: postTime,
      }

      var newPostKey = firebase.database().ref(path).push().key;

      var updates = {};
      updates[path + '/' + newPostKey] = postData;
      if (this.ayIsConsumer) {
        firebase.database().ref('/consumers/' + this.ayCId + '/chats/' + this.ayConversationId + '/lastUpdateFromConsumer').set(postTime);
      } else {
        updates['/customers/' + this.ayAdvId + '/' + this.ayCId + '/' + this.ayConversationId] = {'lastUpdateFromCustomer' : postTime};
      }

      firebase.database().ref().update(updates);

      var rPath = '';
      if (this.ayIsConsumer) {
        rPath = '/consumers/' + this.ayCId + '/chats/' + this.ayConversationId + '/lastUpdateFromConsumer';
      } else {
        rPath = '/customers/' + this.ayAdvId + '/' + this.ayCId + '/' + this.ayConversationId + '/lastUpdateFromCustomer';
      }
      firebase.database().ref(rPath).once('value').then(function(snapshot) {
        if (snapshot !== null && snapshot.val() !== null) {
          var history = this.ayFindChatHistory(this.ayConversationId);
          var index = this.ayFindChatHistoryIndex(this.ayConversationId);
          if (index > -1 && history !== null) {
            this.ayChatHistory.splice(index, 1);

            history[this.ayIsConsumer ? 'lastUpdateFromConsumer' : 'lastUpdateFromCustomer'] = snapshot.val();
            this.ayChatHistory.splice(0, 0, history);

            this.ayUpdateHistoryView(this.ayConversationId, history);
          }
        }
      }.bind(this));
    }
  },

  ayGetCurrentTimestamp: function() {
    return firebase.database.ServerValue.TIMESTAMP;
  },

  ayGetDateTime: function(time) {
    var date = new Date(time);
    var dtStr = this.ayDays[date.getDay()] + ' ';        //Day
    dtStr += date.getDate() + ' ';                //Date
    dtStr += this.ayMonths[date.getMonth()] + ' - ';     //Month
    dtStr += this.ayGet12Hours(date);

    return dtStr;
  },

  ayGet12Hours: function(date) {
    var timeStr = '';
    var hour = date.getHours();
    if (hour === 0) {
      timeStr = '12:';
    } else if (hour > 0 && hour < 13) {
      timeStr = hour + ':';
    } else {
      timeStr = hour-12 + ':';
    }

    timeStr += date.getMinutes() > 9 ? "" : "0";
    timeStr += date.getMinutes() + ':';

    timeStr += hour >= 12 ? "pm" : "am";

    return timeStr;
  },

  ayGetConversationId: function() {
    if (this.ayConversationToken !== null) {
      var path = atob(this.ayConversationToken);
      var array = path.split("/");
      if (array.length === 3) {
        if (this.ayIsConsumer) {
          this.ayCId = array[0];
          this.ayConversationId = array[2];
        } else {
          this.ayAdvId = array[0];
          this.ayCId = array[1];
          this.ayConversationId = array[2];
        }
      }
    }
  },

  aySortHistory: function() {
    this.ayChatHistory.sort(function(a, b) {
      // if (this.ayIsConsumer) {
      //   return parseFloat(b.lastUpdateFromCustomer) - parseFloat(a.lastUpdateFromCustomer);
      // }
      // return parseFloat(b.lastUpdateFromConsumer) - parseFloat(a.lastUpdateFromConsumer);
      var a1 = parseFloat(a.lastUpdateFromConsumer);
      var a2 = parseFloat(a.lastUpdateFromCustomer);
      var b1 = parseFloat(b.lastUpdateFromConsumer);
      var b2 = parseFloat(b.lastUpdateFromCustomer);
      a1 = isNaN(a1) ? 0 : a1;
      a2 = isNaN(a2) ? 0 : a2;
      b1 = isNaN(b1) ? 0 : b1;
      b2 = isNaN(b2) ? 0 : b2;
      return (b1 > b2 ? b1 : b2) - (a1 > a2 ? a1 : a2);
    });
  },

  aySortMessages: function(ayMsgs) {
    return ayMsgs.sort(function(a, b) {
        return parseFloat(a.timestamp) - parseFloat(b.timestamp);
    });
  },

  ayIsMessageFromCurrentConversation: function(path) {
    if (path.startsWith('/')) {
      path = path.substring(1, path.length);
    }
    var ayPathArray = path.split('/');
    if (ayPathArray !== null && ayPathArray.length > 3) {
      return this.ayConversationId === ayPathArray[3];
    }
    return false;
  },

  ayBeep: function() {
    this.ayAudio.play();
  },

  ayFindChatHistoryIndex: function(key) {
    if (this.ayChatHistory !== null) {
      for (var i = 0; i < this.ayChatHistory.length; i++) {
        if (this.ayChatHistory[i].key === key) {
          return i;
        }
      }
    }
    return -1;
  },

  ayFindChatHistory: function(key) {
    if (this.ayChatHistory !== null) {
      for (var i = 0; i < this.ayChatHistory.length; i++) {
        if (this.ayChatHistory[i].key === key) {
          return this.ayChatHistory[i];
        }
      }
    }
    return null;
  },

  ayDays: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
  ayMonths: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  ayAudio: new Audio("data:audio/wav;base64,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KuRFkZlEqw12UJxGZRJulb0JxtCs2SiIoaQpNKsEwVD5gmVciTciWbZWXZIk2MlqFJslIjrbKTRCo2SloEyrBMQlHobQkS54mKsIlnoSJdlFNCVUeSrTZrURVQ0hSbZWgiVYaVYJhCXPIk3LLkoWOGyVZtCs2yrBMQU1FMy45N6qTEFNRTMuOTeqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZPKN9YRsQoHsNXAAAA0gAAABFUmi0CSZIcAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjk3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmT/j/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo="),
  ayDefaultConsumerMsg: 'Please give {BUSINESS_NAME} an idea of what you’d like to talk about (e.g. the details of a job you need done, request some advice or further information about their products and services).',
  ayAdvetiserAutoReply: 'We’ve notified {CONSUMER_NAME} that you’ve replied to their message. Their response will appear below.',
  ayConsumerAutoReply: 'We’ve notified {BUSINESS_NAME} that you’ve sent them a message and their response will appear below. We’ll also send you an email when they’ve replied so you can get back to the conversation.',
  ayContainerDiv: '<div class="ay-search-clamp"> <div class="ay-messages ay-conversation-selected"> <div id="ayMessagesContainer"> <div id="ayUserHeader" class="ay-header"> </div> <div id="ayHistoryContainer" class="ay-conversation-history"> <div class="ay-sub-headers"><div id="ayMobileUserHeader" class="ay-sub-header ay-users-messages ay-small-screen">{PLACEHOLDER}</div> <div id="ayHistoryHeader" class="ay-sub-header"> My message history </div></div><div id="ayHistoryListView" class="ay-conversations"></div></div><div id="ayConversationContainer" class="ay-active-conversation"> <div class="ay-sub-headers"> <div id="ayBackLink" class="ay-sub-header ay-my-message-history ay-small-screen"> &lt; My message history </div> <div id="ayConversationHeader" class="ay-sub-header"> My messages with Jim’s Mowing </div></div><div class="ay-bubbles-container-header"></div><div id="ayBubblesContainer" class="ay-bubbles-container"><ul id="ayConversationListView" class="ay-bubbles-table"></ul></div> <div class="ay-bubbles-container-footer ay-small-screen"></div> <div class="ay-message-input-area"> <textarea id="ayTextArea" class="ay-message" onkeydown="if(event.keyCode == 13) {ayChatContainer.ayOnClickSend(); return false;}" placeholder="Tap here to message Jim’s Mowing"></textarea> <div id="aySubmitButton" class="ay-submit-message" onclick="ayChatContainer.ayOnClickSend()"></div></div><div id="ayFooterMsg" class="ay-weve-sent-an-email">{FOTTER_MSG}</div></div></div></div></div>',
  ayHistoryDiv: '<div id="{HISTORY_ID}" class="ay-conversation"> <div class="ay-details"> <div class="ay-name">{BUSINESS_NAME}</div><div class="ay-address">{BUSINESS_ADDRESS}</div></div>{RATINGS_PLACEHOLDER}<hr class="ay-header-separator"/> <div class="ay-message-stats"> Message started: <span class="ay-message-date">{START_DATE}</span></div><div class="ay-message-stats"> Last updated: <span class="ay-message-date">{LAST_UPDATED}</span></div><div class="ay-links"> <div class="ay-more-info"> <a href="{MORE_INFO_LINK}" target="_blank">More information</a> </div><div class="ay-view-send-message" onclick="ayChatContainer.ayOnClickViewMessage({CONVERSATION_ID})"> View / send message </div></div><div class="ay-conversation-bottom-clear"></div></div>',
  ayRatingsDiv: '<div class="ay-rating-stars"> <div class="ay-stars">{RATING_STARS}</div><div class="ay-reviews">{NO_OF_REVIEWS} reviews </div></div>',
  ayMessageDiv: '<li id="{MESSAGE_ID}" class="ay-bubble-row {CONTENT_TYPE}"> <div class="ay-icon"></div><div class="ay-bubble">{MESSAGE}</div></li><li class="ay-bubble-row-separator"></li>',
  ayConvHeader: ' My messages with {BUSINESS_NAME} ',
  ayTextAreaPlaceHolder: 'Tap here to message {BUSINESS_NAME}',
  ayFooterDiv: 'We’ve sent an email to you at {C_ID}. You can use the link in the email to get back to this conversation with {BUSINESS_NAME} at anytime.',
  ayLoadingDiv: '<div class="ay-loading"></div>',
  ayAddCustomerAutoReply: false,
  ayAddConsumerAutoReply: false
};

function initConsumerMessagingContainer(token, divId) {
  ayChatContainer.ayIsConsumer = true;
  ayChatContainer.ayInitMessagingContainer(token, divId)
}

function initAdvertiserMessagingContainer(token, divId) {
  ayChatContainer.ayIsConsumer = false;
  ayChatContainer.ayInitMessagingContainer(token, divId)
}
