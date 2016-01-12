// Generated by CoffeeScript 1.10.0
(function() {
  var Scope, Status, TaskStore, browse_from, initialize, jsonRequest, main, make_editor, task_store;

  task_store = false;

  Scope = {
    day: 0,
    month: 1,
    year: 2,
    bucket: 3
  };

  Status = {
    unset: 0,
    complete: 1,
    incomplete: 2,
    wrap: 3
  };

  jsonRequest = function(data) {
    var ret;
    ret = $.extend({
      type: "POST",
      contentType: "application/json; charset=UTF-8"
    }, data);
    if (ret.data.comment.id === 0) {
      delete ret.data.comment;
    }
    ret.data = JSON.stringify(ret.data);
    return ret;
  };

  TaskStore = (function() {
    TaskStore.prototype.mount_scope = function(scope, date, mount) {
      var fetch, fetch_date, ref, self;
      self = this;
      fetch = null;
      if (typeof date === 'string') {
        date = moment.utc(date);
      } else {
        date = date.clone();
      }
      fetch_date = date.clone();
      ref = (function() {
        switch (scope) {
          case Scope.day:
            return ["day", fetch_date, "#scope-day-" + (date.format('DD'))];
          case Scope.month:
            return ["month", fetch_date.date(1), "#scope-month"];
          case Scope.year:
            return ["year", fetch_date.date(1).month(0), "#scope-year"];
          case Scope.bucket:
            return ["bucket", fetch_date, "#scope-bucket"];
        }
      })(), fetch = ref[0], fetch_date = ref[1], mount = ref[2];
      return $.get("/habits/tasks/in-" + fetch + "?date=" + (fetch_date.format('YYYY-MM-DD')), function(tasks) {
        var result, title;
        tasks = tasks || [];
        title = (function() {
          switch (false) {
            case scope !== Scope.day:
              return date.format('Do');
            case scope !== Scope.month:
              return date.format('MMMM');
            case scope !== Scope.year:
              return date.format('YYYY');
            case scope !== Scope.bucket:
              return "Bucket";
          }
        })();
        return result = riot.mount(mount, {
          date: date,
          scope: scope,
          tasks: tasks,
          title: title
        });
      });
    };

    function TaskStore() {
      var remount, self;
      riot.observable(this);
      self = this;
      self.on('comment-update', function(task, comment) {
        task["comment"] = comment;
        if (!comment.id) {
          comment.id = 0;
        }
        return $.ajax(jsonRequest({
          url: "/habits/tasks/comment-update",
          success: function() {
            return self.mount_scope(task.scope, task.date);
          },
          data: task
        }));
      });
      self.on('task-new', function(scope, task_name, date) {
        return $.ajax(jsonRequest({
          url: "habits/tasks/new",
          success: function() {
            return self.mount_scope(scope.scope, date);
          },
          data: {
            name: task_name,
            scope: scope.scope,
            date: date.format("YYYY-MM-DDTHH:mm:ssZ")
          }
        }));
      });
      remount = function(path) {
        return function(task) {
          var req;
          req = {
            type: "POST",
            url: path,
            data: JSON.stringify(task),
            contentType: "application/json; charset=UTF-8",
            success: function() {
              return self.mount_scope(task.scope, task.date);
            }
          };
          return $.ajax(req);
        };
      };
      self.on('task-delete', remount('/habits/tasks/delete'));
      self.on('task-order-down', remount('/habits/tasks/order-down'));
      self.on('task-order-up', remount('/habits/tasks/order-up'));
      self.on('task-update', remount('/habits/tasks/update'));
    }

    return TaskStore;

  })();

  initialize = function() {
    console.log('Habits: initializing');
    if (typeof html5 !== "undefined" && html5 !== null) {
      html5.addElements('scope task scope-days');
    }
    task_store = new TaskStore();
    window.Habits.task_store = task_store;
    return RiotControl.addStore(task_store);
  };

  browse_from = function(from) {
    var current_date, today;
    console.log('Browsing from', from);
    today = moment();
    from = moment(from, 'YYYY-MM');
    document.title = (from.format('MMM YYYY')) + " / habits";
    current_date = from.clone();
    task_store.mount_scope(Scope.month, from);
    task_store.mount_scope(Scope.year, from);
    return riot.mount("scope-days", {
      thunk: function() {
        var check, date, next, results;
        date = 1;
        results = [];
        while (date <= from.daysInMonth()) {
          next = from.clone().date(date);
          if (next > today) {
            check = next.clone();
            if (!(check.subtract(4, 'hours') < today)) {
              break;
            }
          }
          task_store.mount_scope(Scope.day, next);
          results.push(date += 1);
        }
        return results;
      }
    });
  };

  main = function() {
    var current_date, make_socket, socket, task_near;
    console.log('Habits: installing router');
    initialize();
    current_date = false;
    RiotControl.on("change-date", function(forward, scope) {
      var date;
      date = scope.date.clone().date(1);
      date[forward ? 'add' : 'subtract'](1, scope.scope === Scope.month ? 'months' : 'years');
      console.log("NEW DATE " + date);
      return riot.route("from/" + (date.format('YYYY-MM')));
    });
    riot.route.start(true);
    riot.route(function(action, rest) {
      switch (action) {
        case 'from':
          return browse_from(rest);
        default:
          return console.log("Unknown action", action);
      }
    });
    riot.route("from/2016-01");
    task_near = function(task, date2) {
      var date1;
      date1 = moment.utc(task.date);
      return ((task.scope === Scope.month || task.scope === Scope.day) && date1.month() === date2.month() && date1.year() === date2.year()) || (task.scope === Scope.year && date1.year() === date2.year()) || task.scope === Scope.bucket;
    };
    socket = false;
    make_socket = function() {
      var url;
      url = "ws://" + window.location.hostname + ":" + window.location.port + "/habits/sync";
      socket = new WebSocket(url);
      socket.onopen = function(m) {
        return console.log("Connected to " + url + " websocket");
      };
      return socket.onmessage = function(m) {
        var date, task;
        console.log("Socket message " + m);
        task = $.parseJSON(m.data);
        date = moment.utc(task.date);
        console.log(task_near(task, current_date), task, current_date);
        if (task_near(task, current_date)) {
          return task_store.mount_scope(task.scope, date);
        }
      };
    };
    socket = make_socket();
    return make_editor();
  };

  make_editor = function(selector, args) {
    var editor;
    if (args == null) {
      args = {};
    }
    editor = window.Habits.editor = new MediumEditor(selector, $.extend({
      autoLink: true
    }, args));
    return editor;
  };

  window.Habits = {
    Scope: Scope,
    Status: Status,
    initialize: initialize,
    task_store: task_store,
    make_editor: make_editor,
    main: main
  };

}).call(this);

//# sourceMappingURL=habits.js.map
