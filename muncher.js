/**
 * MUNCHER.js
 * http://jmrocela.github.com/muncherjs
 *
 * muncher.js is a utility that rewrites classes and ids in CSS, HTML, and JavaScript files
 * in order to save precious bytes and obfuscate your code.
 *
 * Copyright (c) 2013 John Rocela
 * Licensed under the MIT license.
 * https://github.com/gruntjs/grunt/blob/master/LICENSE-MIT
 *
 * @BUG names with "-"
 */

'use strict';

var    path = require('path'),
       glob = require('glob'),
         fs = require('fs'),
      jsdom = require('jsdom').jsdom,
          $ = require('jquery'),
      parse = require('css-parse'),
    Hashids = require('hashids'),
    hashids = new Hashids("use the force harry");

var Muncher = function(options) {
    // custom options
    this.options = {
        // defaults to stuff     
    }

    // tokens
    this.map = {
        "id": {},
        "class": {}
    };

    // files, keep track of sizes
    this.files = { }

    // token counter
    this.mapCounter = 0;

    // ignore classes
    this.ignoreClasses = [ "no-js" ];

    // html extension
    this.htmlExtension = '.html';

    this.compress = true;
}

// constructor
Muncher.prototype.run = function(args) {

    var htmlPaths = args["html"].split(','),
             that = this;

    console.log('Processing:');
    if (htmlPaths) {
        htmlPaths.forEach(function(path) {
            if (fs.statSync(path).isDirectory()) {
                var files = glob.sync(path.replace(/\/$/, '') + '/**/*' + that.htmlExtension);

                files.forEach(function(file) {
                    that.parse(file, 'html');
                });

            } else if (fs.statSync(path).isFile()) {
                that.parse(path, 'html');
            }
        });
    }

    console.log('Building:');
    // we do it again so that we are sure we have everything we need
    if (htmlPaths) {
        htmlPaths.forEach(function(path) {
            if (fs.lstatSync(path).isDirectory()) {
                var files = glob.sync(path.replace(/\/$/, '') + '/**/*' + that.htmlExtension);

                files.forEach(function(file) {
                    that.build(file, 'html');
                });

            } else if (fs.lstatSync(path).isFile()) {
                that.build(path, 'html');
            }
        });
    }

}

// parse the files
Muncher.prototype.parse = function(file, context) {

    if (fs.existsSync(file)) {
        console.log('Getting IDs and Classes from ' + file);

        var content = fs.readFileSync(file, 'utf8').toString();

        this.files[file] = fs.statSync(file).size;

        switch (context) {
            case "html":
                this.parseHtml(content);
            break;
            case "css": 
                this.parseCss(content);
            break;
            case "js": 
                this.parseJs(content);
            break;
        }

    } else {
        console.log('Skipping ' + file + ' because it doesn\'t exist.');
    }

}

// build the files
Muncher.prototype.build = function(file, context) {

    var content = fs.readFileSync(file, 'utf8').toString();

    switch (context) {
        case "html":
            this.rewriteHtml(content, file);
        break;
        case "css": 
            this.rewriteCss(content);
        break;
        case "js": 
            this.rewriteJs(content);
        break;
    }

}

// builds the id and class maps
Muncher.prototype.parseHtml = function(html) {
    var that = this,
        html = $(html);

    html.find('*').each(function(i, elem) {
        var target = html.find(elem),
                id = target.attr('id'),
           classes = target.attr('class');

        if (id) {
            if (!that.map["id"][id]) {
                that.map["id"][id] = hashids.encrypt(that.mapCounter);
                that.mapCounter++;
            }
        }

        if (classes) {
            var newClass = [];

            classes.split(' ').forEach(function(cl) {

                if (!that.ignoreClasses.indexOf(cl)) return; // shoul be a list of no-nos

                if (!that.map["class"][cl]) {
                    that.map["class"][cl] = hashids.encrypt(that.mapCounter); 
                    that.mapCounter++;
                }
            });

        }

        if (target.is('style')) {
            var  style = target.text();
            that.parseCss(style);
        }

        if (target.is('script')) {
            var  script = target.text();
            that.parseScript(script);
        }

    });

}

Muncher.prototype.parseCss = function(css) { 
    var that = this,
         css = parse(css);

    css.stylesheet.rules.forEach(function(style) {
        var selector = style.selector;

        style.selectors.forEach(function(selector) {
            var tid = /#[\w-]+/gmi.exec(selector),
                tcl = /\.[\w-]+/gmi.exec(selector);

            if (tid) {
                var id = tid[0].replace('#', '');
                if (!that.map["id"][id]) {
                    that.map["id"][id] = hashids.encrypt(that.mapCounter);
                    that.mapCounter++;
                }
            }

            if (tcl) {
                var cl = tcl[0].replace('.', '');
                if (!that.ignoreClasses.indexOf(cl)) return; // shoul be a list of no-nos

                if (!that.map["class"][cl]) {
                    that.map["class"][cl] = hashids.encrypt(that.mapCounter); 
                    that.mapCounter++;
                }
            }
        });

    });
}

Muncher.prototype.parseJs = function() { }

// replaces the ids and classes in the files specified
Muncher.prototype.rewriteHtml = function(html, to) {
    var     that = this,
        document = jsdom(html),
            html = $(document);

    html.find('*').each(function(i, elem) {
        var target = html.find(elem),
                id = target.attr('id'),
           classes = target.attr('class');

        if (id) target.attr('id', that.map["id"][id]);

        if (classes) {
            var newClass = [];
            classes.split(' ').forEach(function(cl) {
                if (that.map["class"][cl]) {
                    target.removeClass(cl).addClass(that.map["class"][cl]);
                }
            });
        }

    });

    // write
    html = document.innerHTML;

    html = this.rewriteCssBlock(html);

    html = this.rewriteJsBlock(html);

    fs.writeFileSync(to + '.munched', (this.compress) ? this.compressHtml(html): html);

    var percent = 100 - ((fs.statSync(to + '.munched').size / this.files[to]) * 100);
    console.log('Wrore to ' + to  + '.munched. Saved ' + percent.toFixed(2) + '%');

}

Muncher.prototype.rewriteCssBlock = function(html) {
    var     that = this,
        document = jsdom(html),
            html = $(document);

    html.find('*').each(function(i, elem) {
        var target = html.find(elem);

        if (target.is('style')) {
            var text = target.text();

            // id
            for (var key in that.map["id"]) {
                text = text.replace(new RegExp("#" + key, "gi"), "#" + that.map["id"][key]);
            }

            // class
            for (var key in that.map["class"]) {
                text = text.replace(new RegExp("." + key, "gi"), "." + that.map["class"][key]);
            }
            
            target.text((that.compress) ? that.compressCss(text): text);
        }

    });

    return document.innerHTML;
}

Muncher.prototype.rewriteCss = function() { }

Muncher.prototype.rewriteJsBlock = function(html) {
    return html;
}

Muncher.prototype.rewriteJs = function() { }

// basic compress methods for each context
Muncher.prototype.compressHtml = function(html, compressHead){
    var allHTML = html;
    var headHTML = "";
    var removeThis = "";
    var headstatus = compressHead || true;
    if(headstatus != true){
        //Compress all the things!
        allHTML = allHTML.replace(/(\r\n|\n|\r|\t)/gm,"");
        allHTML = allHTML.replace(/\s+/g," ");
    }else{
        //Don't compress the head
        allHTML = allHTML.replace(new RegExp("</HEAD","gi"),'</head');
        allHTML = allHTML.replace(new RegExp("</head ","gi"),'</head');
        
        var bodySplit = "</head>"; 
        var i = allHTML.indexOf(bodySplit) != -1;
        if(i == true){
            var bodySplit = "</head>"; 
            var tempo = allHTML.split(new RegExp(bodySplit,'i'));
            headHTML = tempo[0];
            allHTML = tempo[1];
        }else{
            bodySplit = ""; 
        }
        allHTML = allHTML.replace(/(\r\n|\n|\r|\t)/gm,"");
        allHTML = allHTML.replace(/\s+/g," ");
        allHTML = headHTML + bodySplit + '\n' + allHTML.replace(/<!--(.*?)-->/gm, "");
    }
    return allHTML;
}

Muncher.prototype.compressCss = function(css) {
    css = css.replace(/(\r\n|\n|\r|\t)/gm, "");
    css = css.replace(/\s+/g, " ");
    return css.replace(/\/\*(.*?)\*\//gm, "");
}

Muncher.prototype.compressJs = function() { }

// create muncher
var munch = new Muncher();

// run muncher
munch.run(require('optimist')
            .usage(fs.readFileSync('./usage'))
            .demand(['html'])
            .argv);

// have fun <3