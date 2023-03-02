# Preamble

The goal of this lab work is to get familiar with a simple way to harness power of GPUs for image processing: *GLSL shaders in WebGL*.

We will be using a constrained and easy-to-learn subset of GLSL features. It is sufficient to implement algorithms working on a neighborhood of a given output pixel though.

We do not focus on performance and code optimization in this lab work.

# Introduction

We will be writing small programs (shaders) actually building output images pixel by pixel. The managing code giving inputs to these programs and calling them will be in JavaScript.

## GLSL quick start

Here is a quick bottom-up introduction to GLSL shaders.

```glsl
precision highp float;

// input image texture
uniform sampler2D inputImage;

// texture coordinates corresponding to the current output pixel position
varying vec2 texCoord;

void main() {
  // sample the input image
  vec4 color = texture2D(inputImage, texCoord);

  // shuffle color channels and write out
  gl_FragColor = color.bgra;
}
```

* GLSL is much like C. There are functions, variables `if`s and loops (`while` and `for`).
* `float foo;` is a variable declaration of fractional scalar type `float`.
* We will operate float-based quantities. `float`, `vec2`, `vec3` and `vec4` are scalar, 2-, 3- and 4-component vector data types respectively.
  * Vector components can be referred to as `r`, `g`, `b`, `a`. If we have got a `vec4 stuff` then `stuff.r` is its first component, `stuff.g` is its second component, etc.
  * `stuff.rg`, `stuff.gb`, `stuff.gg` are valid `vec2` values consisting of the corresponding components of variable `stuff`, while `stuff.rgb`, `stuff.bgr`, `stuff.bbb` etc. are all valid `vec3` values.
  * `x`, `y`, `z` and `w` can be used instead `r`, `g`, `b`, `a` for vectors storing coordinates rather than colors. This is only for readability and has no impact on the resulting program behavior. As we will mainly operate with colors, we stick to `rgba` notation.
* Common binary arithmetic operations (`+`, `-`, `*`, `/`) are defined for vector expressions of the same length, as well as for vector/scalar pairs. `*` and `/` act as pointwise multiplication and division. `dot(x, y)` returns a dot product of vectors `x` and `y`.
* There is a special global variable `texCoords` of "`varying vec2`" type. It specifies the current output pixel position in 0..1 normalized coordinates. This variable is not a part of the GLSL specification: it comes from a predefined vertex shader specifically for this lab work.
* `uniform` specifier defines read-only variables during the shader execution. Their values are set prior to running the shader program.
  * `uniform sampler2D` is a variable referring to an input texture image. A shader may have multiple such variables, to read from multiple textures.
  * `texture2D()` is a function used to read pixels (`vec4` values) from a texture. This function is a part of the GLSL standard. The following code is idiomatic: `vec4 inputColor = texture2D(inputTexture, texCoords);`
  * The output sampling gird and the values `texCoords` may take is fully conditioned by the size of the shader output texture. When sampling an input image of a different size, `texture2D()` is configured to perform the *bilinear interpolation*.
  * You may declare and use `uniform vec2 pixelStep` variable containing the pixel displacement to add to (or subtract from) `texCoords` variable to get the neighbor pixel coordinate. `pixelStep` variable will be automatically filled with a right value if you declare it in your shader. This is not a part of the standard.
* `void main()` function is the entrypoint (a shader may have other functions too). It is executed for every pixel of the output texture.
  * `gl_FragColor` is a `vec4` variable defining the current pixel color in the shader output. In this work, it is the only way for programs to provide output. Setting its value is the main duty of `main`. `gl_FragColor` is a part of the GLSL specification.
  * In this lab work we will be using 8-bit images, i.e., every component of the output texture is internally stored as a 8-bit value. This implies `gl_FragColor` being clipped into 0..1 range.

For more details check out [GLSL ES 1.0 quick reference card](https://www.fsynth.com/pdf/webgl1_glsl_1.pdf).

## Managing code

In order to run GLSL programs, a host environment is required. We go with WebGL: it is widely available, OS- and hardware-independent, and does not require specific software. A web browser sufficient to run GLSL programs; any common modern web browser would work.

The programs are put into an HTML document. Refer to `example_basic.html` and `example_with_controls.html`

 * Input images are loaded using `<img>`. They are referred using unique `id` attributes.
 * GLSL source code is put into `<script>` tags with attribute `type="x-shader/x-fragment"`. They are referred using unique `id` attributes.
 * A big `<script>` chunk in the middle contains the managing code to build programs, assign inputs and launch their execution.
 * `<input>` add knobs to the document and allowing to control uniform variables of shader programs.

WebGL usage might be tricky and is out of the scope of this lab work. Its technicalities are hidden in a set of predefined functions listed out below.

 * `buildProgram(shaderScriptTagId)` builds and returns a GLSL program from the source code in a given `shaderScriptTagId`.
 * `makeTextureFromImage(imgTagId)` loads an image with a given id into a *texture* usable in programs.
 * `makeEmptyTexture(width, height)` allocates an empty texture of a given size in pixels. Such textures can be used as outputs for programs.
 * `runProgram(program, inputs, output)` executes a `program` taking `inputs` object and storing the result to `output` texture.
   * `inputs` is a mapping of uniform variable names to their values. The values can be textures (for `sampler2D` variables), numbers (for `float`s) or arrays (for `vec*` variables).
   * The last argument is optional. If omitted, the program output will be displayed on the screen.
 * `displayTexture(texture)` can be used to display a given texture to the screen.
 * `getKnobValue(inputId)` can be used to retrieve the value of a knob added with an `<input>` tag with a given `inputId`.


# Exercise 1 (warm-up): 256 Shades of Gray

 * Write a program converting a colorful image into a grayscale one.
 * Try out different ways to map colors to gray values.
 * Take inspiration from `example_with_controls.html` to make the conversion parameters tunable.
 * What is the "best" way to map colors to gray? Share your observations.


# Exercise 2: Bass, Mid, Treble

![Decomposition](decomposition.svg)

Decomposing images into "base" and "details" is very common in imaging. We first produce a blurred version of an input image by applying a low-pass filter. It can then be subsampled with no risk of aliasing, providing a coarse-scale "base" image (low-resolution representation of the input). Taking difference of the upsampled "base" and the input image provides a "details" image, containing a high-frequency component of the input.

The original input image can be perfectly reconstructed from its "base" and "details" counterparts.

The decomposition into base/details can then be applied in a recursive fashion, taking "base" as a new input at every iteration. This leads to a multiscale pyramidal representation of the input, with "details" at multiple scales and a "base" image which can be as small as 1*1 pixel.

Likewise, we can perfectly reconstruct the original input from its pyramidal representation, starting from the coarse scale "base", upsampling it, adding "details", upsampling again, etc.. Also, if we apply a multiplicative factor to the details at every scale during the reconstruction, we can amplify or attenuate certain frequencies in the reconstructed image.

**Exercise**: make an "equalizer". A set of programs computing the multiscale representation of the input image and applying gains to the corresponding scales to control the amount of "basses", "mids" and "trebles" in the reconstructed image.
