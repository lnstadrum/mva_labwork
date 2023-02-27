/// Default vertex shader source code
const DEFAULT_VERTEX_SHADER_SOURCE_CODE = "\
attribute vec2 a_position;                                   \n\
attribute vec2 a_texCoord;                                   \n\
uniform bool u_flip;                                         \n\
varying vec2 texCoord;                                       \n\
                                                             \n\
void main() {                                                \n\
  // map to clip space (-1 to +1)                            \n\
  vec2 clipSpace = 2.0 * a_position - 1.0;                   \n\
                                                             \n\
  // output onscreen position                                \n\
  if (u_flip) clipSpace = clipSpace * vec2(1.0, -1.0);       \n\
  gl_Position = vec4(clipSpace, 0.0, 1.0);                   \n\
                                                             \n\
  // output texture coordinates                              \n\
  texCoord = a_texCoord;                                     \n\
}"


/// Default fragment shader source code
const DISPLAY_PROGRAM_FRAGMENT_SHADER_SOURCE_CODE = "\
precision highp float;                               \n\
uniform sampler2D image;                             \n\
varying vec2 texCoord;                               \n\
                                                     \n\
void main() {                                        \n\
  gl_FragColor = texture2D(image, texCoord);         \n\
}"


/// Vertex attribute variable names searched in vertex shaders
const VERTEX_ATTRIBUTE_POSITION = "a_position"
const VERTEX_ATTRIBUTE_TEX_COORD = "a_texCoord"


/// Vertex coordinates for two triangles covering unit square
const UNIT_SQUARE = new Float32Array([0.0,  0.0,
                                      1.0,  0.0,
                                      0.0,  1.0,
                                      0.0,  1.0,
                                      1.0,  0.0,
                                      1.0,  1.0]);


/// Global variables
var frambebufferHandle
var displayProgram
var gl


/// Initializes WebGL context.
function initialize(canvas) {
  // Get WebGL context, make sure it works
  gl = canvas.getContext("webgl");
  if (!gl)
    throw new Error("WebGL does not seem to work in your web browser :(")

  // Create knobs from inputs
  document.onknobchange = document.onknobchange || function() {}
  $("input").knob({
    width: 100,
    height: 100,
    step: 0.01,
    change: function() { document.onknobchange() },
    release: function() { document.onknobchange() }
  });
}


/// Checks GL error code. Throws exception if there is any hanging error.
function checkGlError() {
  const code = gl.getError();
  if (code != 0)
    throw new Error("GL error got " + code);
}


/// Compiles a GLSL shader from its source code.
/// Returns the compiled shader handle on success.
function compile(sourceCode, shaderType) {
  // Create shader object
  const shader = gl.createShader(shaderType);

  // Load the source code and compile
  gl.shaderSource(shader, sourceCode);
  gl.compileShader(shader);

  // Check compilation status, report errors if any
  const isCompiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!isCompiled) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader);
    throw new Error(log);
  }

  return shader;
}


/// Links vertex and fragment shader into a GLSL program.
/// Returns the linked program handle on success.
function link(vertexShader, fragmentShader) {
  // Instantiate a program
  const program = gl.createProgram();

  // Attach shaders
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);

  // Link the program
  gl.linkProgram(program);

  // Check linkinig status, report errors
  const isLinked = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!isLinked) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(log);
  }

  return program;
}


/// Creats a GLSL program.
/// If the vertex shader source is omitted, the default vertex shader is used.
function buildGenericProgram(vertexShaderSrc, fragmentShaderSrc) {
  // Compile shaders
  const vertexShader = compile(vertexShaderSrc, gl.VERTEX_SHADER);
  const fragmentShader = compile(fragmentShaderSrc, gl.FRAGMENT_SHADER);
  
  // Link the program
  const program = link(vertexShader, fragmentShader)

  // Once linked, can safely delete shaders to save memory
  gl.detachShader(program, vertexShader);
  gl.detachShader(program, fragmentShader);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return program
}


/// Builds an "imaging" program: sets up vertex attributes to render a unit square.
function buildProgramFromSource(vertexShaderSrc, fragmentShaderSrc) {
  // Build the program first
  const program = buildGenericProgram(vertexShaderSrc, fragmentShaderSrc)
  
  // Make the program active
  gl.useProgram(program);

  // Grab uniform locations
  const vertexPosUniformLoc = gl.getAttribLocation(program, VERTEX_ATTRIBUTE_POSITION);
  const texCoordUniformLoc = gl.getAttribLocation(program, VERTEX_ATTRIBUTE_TEX_COORD);

  // Check they are valid
  if (vertexPosUniformLoc < 0)
    throw new Error("Unable to look up vertex position variable " + VERTEX_ATTRIBUTE_POSITION + " in the program");
  if (texCoordUniformLoc < 0)
    throw new Error("Unable to look up vertex attribute variable " + VERTEX_ATTRIBUTE_TEX_COORD + " in the program");

  // Set up vertex position buffer
  const vertexPosBuffer = gl.createBuffer();
  gl.enableVertexAttribArray(vertexPosUniformLoc);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexPosBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, UNIT_SQUARE, gl.STATIC_DRAW);
  gl.vertexAttribPointer(vertexPosUniformLoc, 2, gl.FLOAT, false, 0, 0);

  // Set up texture coordinates vertex attribute buffer
  // (happens to have the same content...)
  const textCoordBuffer = gl.createBuffer();
  gl.enableVertexAttribArray(texCoordUniformLoc);
  gl.bindBuffer(gl.ARRAY_BUFFER, textCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, UNIT_SQUARE, gl.STATIC_DRAW);
  gl.vertexAttribPointer(texCoordUniformLoc, 2, gl.FLOAT, false, 0, 0);
  
  // Check error
  checkGlError()
  
  return program
}


/// Builds a program with the default vertex shader and a given fragment shader <script> tag.
function buildProgram(fragmentScriptId) {
  // Check inputs
  if (!fragmentScriptId)
    throw new Error("`fragmentScriptId` required")  
  const fragmentScript = document.getElementById(fragmentScriptId);
  if (!fragmentScript)
    throw new Error("Unable to find " + fragmentScriptId + " element")

  return buildProgramFromSource(DEFAULT_VERTEX_SHADER_SOURCE_CODE, fragmentScript.text.trim())
}


/// Makes a GPU texture object from an <img> tag with a given id
function makeTextureFromImage(imgId) {
  // Check inputs
  if (!imgId)
    throw new Error("`imgId` required")  
  const image = document.getElementById(imgId);
  if (!image)
    throw new Error("Unable to find " + imgId + " element")

  // Allocate texture
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Set up sampling parameters
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
  // Upload the texture contents
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  // Check error
  checkGlError()

  return {
    texture: texture,
    width: image.naturalWidth,
    height: image.naturalHeight
  };
}


/// Creates an empty texture of a given size (in pixels).
function makeEmptyTexture(width, height) {
  // Check inputs
  if (!width || !height)
    throw new Error("Width and height are required")
  const texture = gl.createTexture();

  // Allocate, set parameters
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                width, height, 0, gl.RGBA,
                gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  // Return wrapped
  return {
    texture: texture,
    width: width,
    height: height
  };
}


/// Runs a GLSL program using a given set of input textures
function runProgram(program, inputs, outputTexture) {
  // Make the program active
  gl.useProgram(program);
  
  // Loop inputs
  var bindingPoint = 1;
  for (const name in inputs) {
    // Look up the uniform variable in the shader
    const loc = gl.getUniformLocation(program, name);
    if (loc == null)
      throw new Error("Unable to look up texture variable " + name + " in the program");

    // If got a number, set a scalar uniform variable
    if (!isNaN(inputs[name])) {
      gl.uniform1f(loc, inputs[name]);
    }

    // If got an array, set a vector uniform variable
    else if (Array.isArray(inputs[name])) {
      switch (inputs[name].length) {
        case 1:
          gl.uniform1fv(loc, inputs[name]);
          break;
        case 2:
          gl.uniform2fv(loc, inputs[name]);
          break;
        case 3:
          gl.uniform3fv(loc, inputs[name]);
          break;
        case 4:
          gl.uniform4fv(loc, inputs[name]);
          break;
      }
    }

    // Otherwise consider input is a texture to bind to a uniform sampler
    else {
      gl.activeTexture(gl.TEXTURE0 + bindingPoint);
      gl.bindTexture(gl.TEXTURE_2D, inputs[name].texture);
      gl.uniform1i(loc, bindingPoint);
      if (outputTexture) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); 
      }
      else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      }
      bindingPoint++;
    }
  }

  // Check error
  checkGlError()
  
  // Bind output texture if given
  var outputWidth
  var outputHeight
  if (outputTexture) {
    // Set up the framebuffer if not yet
    if (!frambebufferHandle)
      frambebufferHandle = gl.createFramebuffer();

    // Bind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, frambebufferHandle);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputTexture.texture, 0);
    checkGlError()
    
    // Output to texture: disable vertical flipping
    gl.uniform1i(gl.getUniformLocation(program, "u_flip"), 0)

    outputWidth = outputTexture.width
    outputHeight = outputTexture.height
  }
  else {
    // Output to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.uniform1i(gl.getUniformLocation(program, "u_flip"), 1)

    outputWidth = gl.canvas.width
    outputHeight = gl.canvas.height
  }
  

  // Set "pixelStep" uniform variable, if present
  const dx = 1 / outputWidth;
  const dy = 1 / outputHeight;
  const pixelStepLoc = gl.getUniformLocation(program, "pixelStep");
  if (pixelStepLoc)
    gl.uniform2f(pixelStepLoc, dx, dy);
  gl.viewport(0, 0, outputWidth, outputHeight);

  // Set up texture coordinates vertex attribute buffer
  // (happens to have the same content...)
  const texCoordUniformLoc = gl.getAttribLocation(program, VERTEX_ATTRIBUTE_TEX_COORD);
  if (texCoordUniformLoc < 0)
    throw new Error("Unable to look up vertex attribute variable " + VERTEX_ATTRIBUTE_TEX_COORD + " in the program");

  // Clear viewport
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Initiate render pass (draw primitives)
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}


/// Runs a program displaying passed texture
function displayTexture(texture) {
  if (!displayProgram)
    displayProgram = buildProgramFromSource(DEFAULT_VERTEX_SHADER_SOURCE_CODE, DISPLAY_PROGRAM_FRAGMENT_SHADER_SOURCE_CODE)
  runProgram(displayProgram, {image: texture});
}


/// Returns value of a knob by its ID
function getKnobValue(id) {
  return parseFloat(document.getElementById(id).value);
}


/// Entrypoint
(function() {
  Promise.all(
    Array.from(document.images).map(
      function (img) {
        if (img.complete)
          return Promise.resolve();
        return new Promise(function(resolve, reject) {
          img.addEventListener('load', resolve);
          img.addEventListener('error', function() { reject(img.src) });
        });
      }
    )
  ).then(
    main,
    function(failedUrl) {
      alert("Cannot load " + failedUrl)
    }
  ).catch(
    function(error) {
      alert(error)
      throw error
    }
  );
})()