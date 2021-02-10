#!/usr/bin/env node

const fastify = require('fastify');
const GifEncoder = require('gifencoder');
const { createCanvas } = require('canvas');
const { Life } = require('dat-life');
const { Contributions } = require('contributions');

const contributionCache = {
    date: undefined,
    users: { }
};

const imageCache = {
    date: undefined,
    users: { }
};

const app = fastify({ logger: true });

const background = [ 255, 255, 255 ];

const palette = [
    [ 235, 237, 240 ],
    [ 172, 230, 174 ],
    [ 105, 192, 110 ],
    [  84, 158,  87 ],
    [  56, 107,  62 ]
];

const scaling = 2;
const squareSize = 10 * scaling;
const spacing = 3 * scaling;

const headerWidth = 24 * scaling;
const headerHeight = 15 * scaling;

function drawGraph(args) {
    const life = args.life;
    const contributions = args.contributions;
    const context = args.context;
    const encoder = args.encoder;
    const encoderStream = args.encoderStream;
    const request = args.request;
    const reply = args.reply;
    const response = args.response;
    const delay = args.delay;
    const frames = args.frames;

    const days = contributions.getDays();
    const dimensions = life.getWidth() * life.getHeight();

    if (request.raw.closed || request.raw.destroyed || reply.raw.closed || reply.raw.destroyed || encoderStream.closed) {
        return;
    }

    console.log("Drawing graph...");

    context.fillStyle = `rgb(${background[0]}, ${background[1]}, ${background[2]})`;
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);

    context.font = `${9 * scaling}px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji`;
    context.fillStyle = `rgb(118, 118, 118)`;

    // draw the days of week
    context.fillText('Mon', 0, headerHeight + (22 * scaling));
    context.fillText('Wed', 0, headerHeight + (48 * scaling));
    context.fillText('Fri', 0, headerHeight + (73 * scaling));

    // draw the months
    for (let x = 0; x < 53; x++) {
        const months = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul',
            'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];

        const weekDate = new Date(days[(7 * x)].getDate());

        if (weekDate.getDate() <= 7) {
            const month = months[weekDate.getMonth()];
            context.fillText(month, headerWidth + (x * (squareSize + spacing)), 20);
        }
    }

    // draw contribution squares
    for (let idx = 0; idx < days.length; idx++) {
        const x = Math.floor(idx / 7);
        const y = (idx % 7);
        const intensity = life.get(x, y);
        const color = palette[intensity];

        if (idx > days.length) {
            continue;
        }

        const contextX = headerWidth + (x * (squareSize + spacing));
        const contextY = headerHeight + (y * (squareSize + spacing));

        context.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        context.fillRect(contextX, contextY, squareSize, squareSize);
    }

    // clear any remainder from the life board so that invisible squares
    // don't contribute to the next generation
    for (let remain = days.length; remain < dimensions; remain++) {
        const x = Math.floor(remain / 7);
        const y = (remain % 7);

        life.set(x, y, 0);
    }

    encoder.addFrame(context);

    life.next();

    if (--args.frames) {
        if (delay)
            setTimeout(drawGraph, delay, args);
        else
            drawGraph(args);
    }
    else {
        encoder.finish();
    }
}

function fillGraph(life, contributions) {
    const days = contributions.getDays();

    for (let i = 0; i < days.length; i++) {
        const x = Math.floor(i / 7);
        const y = (i % 7);

        life.set(x, y, days[i].getIntensity());
    }
}

function getDate() {
    const today = new Date();

    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    return year + '-' +
        (month < 10) ? '0' : '' + month +
        (day < 10) ? '0' : '' + day;
}

function getCachedImage(username) {
    const date = getDate();

    if (imageCache.date !== date) {
        console.log(`Image cache is from ${imageCache.date ? imageCache.date : '(never)'}, invalidating`);

        imageCache.date = date;
        imageCache.users = { };
    }

    console.log(imageCache);

    if (imageCache.users[username]) {
        console.log(`Using cached image data for ${username}`);
        return imageCache.users[username];
    }
}

function saveCachedImage(username, data) {
    console.log(`Saving cached image data for ${username}`);
    imageCache.users[username] = data;
}

async function getContributions(username) {
    const date = getDate();

    if (contributionCache.date !== date) {
        console.log(`Contribution cache is from ${contributionCache.date ? contributionCache.date : '(never)'}, invalidating`);

        contributionCache.date = date;
        contributionCache.users = { };
    }

    if (contributionCache.users[username]) {
        console.log(`Using cached contributions data for ${username}`);
        return contributionCache.users[username];
    }

    const contributions = await Contributions.forUser(username);

    console.log(`Saving contributions data for ${username}`);
    contributionCache.users[username] = contributions;

    return contributions;
}

app.log.info("Setting up route for: /");

app.get('/', async (request, reply) => {
    reply.header('Location', 'https://github.com/ethomson/github4life');
    reply.code(302);
    reply.send(`<html><head><title>github4life</title></head><body><a href="https://github.com/ethomson/github4life">Moved here</a>.</body></html>`);
});

app.get('/:username', async (request, reply) => {
    if (request.params.username.endsWith(".gif")) {
        request.params.username = request.params.username.slice(0, -4);
        await showGif(request, reply);
    }
    else {
        await showPage(request, reply);
    }
});

app.addHook('onError', async (request, reply, error) => {
    console.log('ERROR');
});

async function showGif(request, reply) {
    let camo = false;
    let seed = false;

    // Generally we want to deliver frames forever, so for interactive
    // user agents we don't put a delay into the gif itself, we just
    // send new frames every 1000ms.  For caching services, though,
    // we want to deliver a set number of frames, with the gif's frame
    // delay set to 1000ms.  We want to do this immediately so that the
    // request doesn't time out.
    if (request.headers['user-agent'].match(/^github-camo/)) {
        camo = true;
    }

    if (request.query.camo === 'true') {
        camo = true;
    }

    if (request.query.seed === 'true') {
        camo = true;
        seed = true;
    }

    if (request.query.cachebust === 'true') {
        contributionCache.users[request.params.username] = undefined;
        imageCache.users[request.params.username] = undefined;
    }

    console.log(`Request from ${request.headers['user-agent']}: camo mode: ${camo}, seed mode: ${seed}, cache bust mode: ${request.query.cachebust}`);

    if (camo && (image = getCachedImage(request.params.username))) {
        console.log(`Using cached image for ${request.params.username}`);
        reply.setHeader('Cache-Control', 'no-cache');
        reply.setHeader('Pragma', 'no-cache');
        reply.type('gif');
        reply.send(image);
        return;
    }
    else if (camo) {
        console.log(`No cached image for ${request.params.username}`);
    }

    let contributions;
    try {
        contributions = await getContributions(request.params.username);
    }
    catch (err) {
        console.error(`Could not get contribution graph for ${request.params.username}: ${err}`);
        reply.sendStatus(404);
        return;
    }

    const encoder = new GifEncoder(854 * scaling, 112 * scaling);
    const encoderStream = encoder.createReadStream();

    if (camo) {
        let buf = Buffer.alloc(0);
        encoderStream.on('data', function(d) { buf = Buffer.concat([buf, d]); });
        encoderStream.on('end', function() { saveCachedImage(request.params.username, buf); });
    }

    encoder.start();
    encoder.setRepeat(-1);
    encoder.setDelay(camo ? 1000 : 0);
    encoder.setQuality(75);

    const canvas = createCanvas(854 * scaling, 112 * scaling);
    const context = canvas.getContext('2d');

    const life = new Life(53, 7);
    life.setColors(4);
    life.setDecay(true);

    fillGraph(life, contributions);

    let frames = camo ? 50 : 2147483647;

    if (seed) {
        frames = 250;
    }

    reply.header('Cache-Control', 'no-cache');
    reply.header('Pragma', 'no-cache');
    reply.header('Content-type', 'image/gif');
    reply.send(encoderStream);
    reply.then(() => { console.log("hi") }, () => { console.log("bye") });
    drawGraph({
        request: request,
        reply: reply,
        life: life,
        contributions: contributions,
        encoder: encoder,
        encoderStream: encoderStream,
        context: context,
        frames: frames,
        delay: camo ? 0 : 1000
    });
    console.log("DONE");
}

async function showPage(request, reply) {
    const params = request.query.camo === 'true' ? '?camo=true' : '';

    reply.code(200);
    reply.header("Content-type", "text/html");
    reply.send(`<html>
<head>
<title>GitHub 4 Life</title>
</head>
<body style="font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji;">
<div style="width: 718px; margin: auto; padding: 0;">
<h1>GitHub 4 Life</h1>

<p>
A four-color game of life based on your GitHub contribution graph.
</p>

<h3 style="margin: 0 0 5px 23px; padding: 0;">${request.params.username}</h3>
</div>

<div style="width: 990px; margin: auto;">
<img src="/${request.params.username}.gif${params}" style="width: 854px; height: 112px; margin: 0 0 0 136px; padding: 0;">
</div>

<div style="width: 718px; margin: auto; padding: 0;">
<h3 style="margin: 40px 0 0 0;">What's this?</h3>

<p>
This is "GitHub 4 Life" - so named because it takes a <i><b>GitHub</b></i> contribution graph and turns it into a <i><b>4</b></i> color Game of <i><b>Life</b></i>.
</p>

<p>
The GitHub contribution graph is used as the initial state for <a href="https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life">Conway's Game of Life</a>, a popular cellular automaton that is often built by beginning software developers as an easy-to-implement but interesting piece of software.
</p>

<p>
Conway's Game of Life only defines two initial states for cells, but there are <a href="https://conwaylife.com/ref/mniemiec/color.htm">multi-color variants</a>.  This is a variant of "Quad Life" (chosen because the GitHub contribution graph has four colors that represent the intensity of contributions for a given day): in the typical Game of Life rules, a graph with a lot of contribution would die out in the first iteration (because the cells would be overcrowded), which seems to punish those with a lot of contributions, giving them a boring Game of Life. Intead, this variant "decays" the level of contribution, so cells will fade away instead of dying immediately.
</p>

<h3>How does it work?</h3>

<p>
This uses a JavaScript library called <a href="https://npmjs.com/contributions">contributions</a> to create a data structure with a GitHub contribution graph, and uses that as the initial state for another JavaScript library called <a href="https://npmjs.com/dat-life">dat-life</a>.  The <a href="https://github.com/ethomson/github4life">github4life</a> application then renders this as an animated GIF.  It does this indefinitely; it will render the game of life on-demand - infinitely continuing to deliver you the next state as a new frame in the GIF, forever.
</p>

<p style="margin-bottom: 60px;">
By <a href="https://github.com/ethomson">Edward Thomson</a>, 2020.
</p>
</div>
</body>
</html>`);
}

const start = async () => {
    try {
        await app.listen(process.env.PORT || 8080);
    } catch (err) {
        app.log.error(err)
        process.exit(1)
    }
}

start()
