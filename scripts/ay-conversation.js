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

      /*//Subscribe to events
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
      }.bind(this));*/
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

            if (this.ayAddCustomerAutoReply && ayMsg.from.toLowerCase() !== 'consumer') {
              this.ayAddCustomerAutoReply = false;
              this.ayAddAutoReplyMessage(uNickName); //Default message

              this.aySendEmailNotification("CONSUMER EMAIL 2"); //Email consumer
            } else if (this.ayAddConsumerAutoReply && ayMsg.from.toLowerCase() === 'consumer') {
              this.ayAddConsumerAutoReply = false;
              this.ayAddConsumerAutoReplyMessage(history.customer.businessName);

              this.aySendEmailNotification("BUSINESS EMAIL 1"); //Email customer
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
