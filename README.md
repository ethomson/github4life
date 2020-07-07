# GitHub 4 Life

[![ethomson's contribution graph as a Game of Life](https://github4life.herokuapp.com/ethomson.gif)](https://github4life.herokuapp.com/ethomson)

A Node.js application that takes a user's [GitHub Contribution Graph](https://docs.github.com/en/github/setting-up-and-managing-your-github-profile/viewing-contributions-on-your-profile) as input for a [four-color variant](https://conwaylife.com/ref/mniemiec/color.htm) of [Conway's Game of Life](https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life).

This game is sent to you as an animated GIF.  Each generation of the game will be sent as a frame in the GIF.

The game will be played forever.  There is no end to the animated GIF, it will just be sent to you until you close the window or your browser runs out of RAM.

You can see it at [https://github4life.herokuapp.com/ethomson](https://github4life.herokuapp.com/ethomson).

## The Game

[Conway's Game of Life](https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life) is a piece of [cellular automata](https://en.wikipedia.org/wiki/Cellular_automaton) that is simple to reason about and program, but leads to interesting and sometimes surprising results.  Because of its simplicity in how the cells change throughout generations, it is often an early program written by those learning software development.

The original Game of Life supports two states for cells - alive or not - but there are [multi-color variants](https://conwaylife.com/ref/mniemiec/color.htm).  In particular, a four-color variant suits the GitHub Contribution Graph nicely, since it has four levels of "intensity" of contributions on given days.  The GitHub Contribution Graph could therefore be used as the starting condition for a four-color game of life.

However, "Quad Life", as described, uses the same algorithm for determining cell state as the original Game of Life.  This is imperfect for us: a contribution graph with a lot of work is not actually a satisfying game - when there are many filled blocks (live cells), there is rampant overpopulation in the game, and the next generation will basically be an empty board due to a mass die-off.

So this uses a modification to the typical rules: instead of a cell dying immediately, it will "decay".  So a cell at intensity 4 becomes a cell at intensity 3.  This produces a more visually interesting game when starting with a heavily loaded contribution graph.

## The GIF

Animated GIFs are fun because you send the first frame... then the next... and eventually you send the final frame.  But within the file format, you don't need to prefix it with the number of frames.

So if you just _keep sending frames_, it turns out that most browsers will just render them forever.  So, we can simply set a delay between frames of `0`, render and send a frame every second, and most browsers will dutifully comply, and just render it as a movie that plays forever, until you close the window, the app serving the movie crashes, or you run out of RAM.

_Unfortunately_, some sites - like GitHub - are a little more clever about this and instead of linking you off-site for images, they'll download them, cache them on their service, and then link you to those.  On GitHub, this is a service called "camo", and this shows up when you (for instance) create a link in your `README` to an image.  When viewing the page on `github.com` (the website), you'll actually see an inline image at `githubusercontent.com`.

As you can imagine, you can't cache a GIF that never ends, so this app has a special "camo mode" where it will render a finite GIF that has a bunch of frames and then deliver it as fast as possible (camo also has a 4 second timeout).

The app will cache these finite camo-friendly GIFs.

## The App

This is a Node.js application that makes use of two new libraries:

* [contributions](https://github.com/ethomson/contributions) [[npm](https://npmjs.com/contributions)]
  A library to parse the GitHub Contribution Graph.  It basically screen-scrapes the output from GitHub, parsing the DOM.  So...  a little better than hitting it over the head with regular expressions, but not much.
* [dat-life](https://github.com/ethomson/dat-life) [[npm](https://npmjs.com/dat-life)]
  A library to live dat life, or more accurately, to play the Game of Life.  It plays the classic game created by Conway, as well as two- and four-color variants, including the "decay" mode variant that we use here.

These libraries don't actually produce any data, so the [gifencoder](https://github.com/eugeneware/gifencoder) package is used to create GIFs that are sent to browsers.

---

Copyright [Edward Thomson](https://twitter.com/ethomson).  Available under the MIT license.
