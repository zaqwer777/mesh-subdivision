///<reference path='./typings/tsd.d.ts'/>
///<reference path="./localTypings/webglutils.d.ts"/>

/*
 * Portions of this code are
 * Copyright 2015, Blair MacIntyre.
 * 
 * Portions of this code taken from http://webglfundamentals.org, at https://github.com/greggman/webgl-fundamentals
 * and are subject to the following license.  In particular, from 
 *    http://webglfundamentals.org/webgl/webgl-less-code-more-fun.html
 *    http://webglfundamentals.org/webgl/resources/primitives.js
 * 
 * Those portions Copyright 2014, Gregg Tavares.
 * All rights reserved.
 */

 // the model loader
import * as loader from './loader.js';

// the simple "F" model at startup
import * as f3d from './f3d.js';

////////////////////////////////////////////////////////////////////////////////////////////
// stats module by mrdoob (https://github.com/mrdoob/stats.js) to show the performance 
// of your graphics
var stats = new Stats();
stats.setMode( 1 ); // 0: fps, 1: ms, 2: mb

stats.domElement.style.position = 'absolute';
stats.domElement.style.right = '0px';
stats.domElement.style.top = '0px'; 

document.body.appendChild( stats.domElement );

////////////////////////////////////////////////////////////////////////////////////////////
// some simple utilities methods
var rand = function(min: number, max?: number) {
  if (max === undefined) {
    max = min;
    min = 0;
  }
  return min + Math.random() * (max - min);
};

var randInt = function(range: number) {
  return Math.floor(Math.random() * range);
};

////////////////////////////////////////////////////////////////////////////////////////////
// get some of our canvas elements that we need
var canvas = <HTMLCanvasElement>document.getElementById("webgl");  
var filename = <HTMLInputElement>document.getElementById("filename");
var fileSelection = <HTMLSelectElement>document.getElementById("files");
var progressGuage = <HTMLProgressElement>document.getElementById("progress");
progressGuage.style.visibility = "hidden";

////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////
// declare an interface for our objects!
//
// TODO: add elements for the adjacency data structures (e.g., corners, swing, etc)
// 
// TODO: methods for the adjacency operators
// you should write methods for the various adjacency operators, like "next","previous","swing"
// and so on.  Some of them will just return the value in the the tables, some will compute
// the value from those tables.
//
// You can convert MeshObject to class and add these methods to it, or just write methods that
// take a MeshObject as a parameter.  Your choice. 

/*
interface MeshObject {
  boundingBox: [GLM.IArray, GLM.IArray],
  scaleFactor: number, 
  center: [number, number, number],
  numElements: number,
  arrays: {
    position: Float32Array,
    normal: Float32Array,
    color: Uint8Array,
    indices: Uint16Array
  },
  buffers?: {
    position: WebGLBuffer | null,
    normal: WebGLBuffer | null,
    color: WebGLBuffer | null,
    indices: WebGLBuffer | null
  }
} */

class MeshObject {
  boundingBox: [GLM.IArray, GLM.IArray];
  scaleFactor: number;
  center: [number, number, number];
  numElements: number;
  arrays: {
    position: Float32Array,
    normal: Float32Array,
    color: Uint8Array,
    indices: Uint16Array
  };
  buffers?: {
    position: WebGLBuffer | null,
    normal: WebGLBuffer | null,
    color: WebGLBuffer | null,
    indices: WebGLBuffer | null
  }
  vertexTable: Uint16Array;
  cornerTable: Uint16Array;
  oppositeTable: Uint16Array; 

  constructor(boundingBox: [GLM.IArray, GLM.IArray], scaleFactor: number, center: [number, number, number], numElements: number,
    arrays: {position: Float32Array, normal: Float32Array, color: Uint8Array, indices: Uint16Array}, 
    buffers?: {position: WebGLBuffer | null, normal: WebGLBuffer | null, color: WebGLBuffer | null, indices: WebGLBuffer | null}) {
    this.boundingBox = boundingBox;
    this.scaleFactor = scaleFactor; 
    this.center = center;
    this.numElements = numElements;
    this.arrays = arrays;
    this.buffers = buffers;
    this.vertexTable = new Uint16Array;
    this.cornerTable = new Uint16Array;
    this.oppositeTable = new Uint16Array;
  }

  getVertex(corner: number) {
    return this.vertexTable[corner]
  }
  
  getNext(corner: number) {
    return (corner + 1) % 3 + this.getTriangle(corner) * 3;
  }

  getPrev(corner: number) {
    return this.getNext(this.getNext(corner))
  }

  getTriangle(corner: number) {
    return Math.floor(corner / 3)
  }

  getOpposite(corner: number) {
    return this.oppositeTable[corner]
  }

  getSwing(corner: number) {
    return this.getNext(this.getOpposite(this.getNext(corner)))
  }

  getLeft(corner: number) {
    return this.getOpposite(this.getNext(corner))
  }

  getRight(corner: number) {
    return this.getOpposite(this.getPrev(corner))
  }
}

// when a new mesh comes in, we will process it on the next frame of the update.
// to tell the update we have a new mesh, set the newObject variable to it's data
var newObject: MeshObject | undefined = undefined;

// the current object being displayed
var object: MeshObject | undefined = undefined;

////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////
// stub's for  callbacks for the model downloader.


////////////////////////////////////////////////////////////////////////////////////////////
// called when the mesh is successfully downloaded
//
// this method currently sets up some of the information needed to render
// TODO:  in this method, you will need to do two things:
// - set up the various adjacency tables (corner, swing or opposite, etc)
// - REWRITE the vertex normal calculation to be done using the data in MeshObject, using 
//   the adjacency operators as described in the mesh operations notes. In particular, you
//   should compute the vertex normal directly for each vertex using v.c and by moving around
//   the triangles attached to v using the swing operator.   You are doing this for two reasons:
//   first, as a way to make sure your adjacency tables and operators work, and second, 
//   because you need to move the vertex normal calculations out of "onLoad" since they will 
//   need to be redone each time you subdivide.    

var onLoad = function (mesh: loader.Mesh) {
    progressGuage.value = 100;
    progressGuage.style.visibility = "hidden";
    console.log("got a mesh: " + mesh);
    
    // the vertex array and the triangle array are different lengths.
    // we need to create new arrays that are not nested
    // - position: 3 entries per vertex (x, y, z)
    // - normals: 3 entries per vertex (x, y, z), the normal of the corresponding vertex 
    // - colors: 4 entries per vertex (r, g, b, a), in the range 0-255
    // - indices: 3 entries per triangle, each being an index into the vertex array. 
    var numVerts = mesh.v.length;
    var numTris = mesh.t.length;

    var position: number[] = [];
    var normal: number[] = [];    // TODO: computed here now, will need to be done in 
    var color: number[] = [];
    var indices: number[] = [];

    // set up position and color arrays
    for (var ii = 0; ii < numVerts; ++ii) {
      // add the vertex to the position array
      position.push(mesh.v[ii][0], mesh.v[ii][1], mesh.v[ii][2]);
      
      // create a random color for the vertex
      var h = chroma.hsv(rand(360), 0.5, 1);
      var c = h.rgba();
      color.push(c[0], c[1], c[2], 255);
    }      

    //console.log(mesh.t)

    // set up the indicies array
    for (var ii = 0; ii < numTris; ++ii) {
      // add the index to the indices array
      indices.push(mesh.t[ii][0], mesh.t[ii][1], mesh.t[ii][2]);
      //console.log(ii, mesh.t[ii][0], mesh.t[ii][1], mesh.t[ii][2])
    }      

    //console.log(indices)

    //for (var x = 0; x < indices.length; x++) {
      //console.log(x, indices[x])
    //}

    /////////////////////////
    // compute the normals
    var normalVecs = [];
    for (var ii = 0; ii < numVerts; ++ii) {
      // initialize normal's to null vector;  we'll convert this to the correct format below
      normalVecs.push(vec3.create());
      //console.log(normalVecs)
    }

    for (var ii = 0; ii < numTris; ++ii) {
      // compute the triangle normal and save in triNormals
      const v1 = vec3.subtract(vec3.create(), mesh.v[mesh.t[ii][1]], mesh.v[mesh.t[ii][0]]);
      //console.log(v1, ii, "Orig")
      //console.log(mesh.t[ii][1])
      const v2 = vec3.subtract(vec3.create(), mesh.v[mesh.t[ii][2]], mesh.v[mesh.t[ii][0]]);
      //console.log(v2, ii, "Orig")
      var n = vec3.cross(vec3.create(), v1, v2);
      //console.log(n, ii, "Orig")
      
      // add the polygon normal to each of the vertices
      var n1 = normalVecs[mesh.t[ii][0]];
      vec3.add(n1, n1, n);
      //console.log(n1, "O", ii)
      var n2 = normalVecs[mesh.t[ii][1]];
      vec3.add(n2, n2, n);
      //console.log(n2, "O", ii)
      var n3 = normalVecs[mesh.t[ii][2]];
      vec3.add(n3, n3, n);
      //console.log(n3, "O", ii)
    }
    
    for (var ii = 0; ii < numVerts; ++ii) {
      n = normalVecs[ii];
      vec3.normalize(n,n);
      normal.push(n[0],n[1],n[2]);
    }  

    //console.log(normal)
    
    ///////////////////////
    // we also want the bounding box of the object (for rendering)
    var xmin = mesh.v[0][0];
    var xmax = mesh.v[0][0];
    var ymin = mesh.v[0][1];
    var ymax = mesh.v[0][1];
    var zmin = mesh.v[0][2];
    var zmax = mesh.v[0][2];
    
    for (var ii = 1; ii < numVerts; ++ii) {
      var v = mesh.v[ii];
      if (v[0] < xmin) xmin = v[0];
      if (v[0] > xmax) xmax = v[0];
      if (v[1] < ymin) ymin = v[1];
      if (v[1] > ymax) ymax = v[1];
      if (v[2] < zmin) zmin = v[2];
      if (v[2] > zmax) zmax = v[2];
    }
    
    var bb1 = vec3.fromValues(xmin, ymin, zmin);
    var bb2 = vec3.fromValues(xmax, ymax, zmax);

    //C[v] input vertex return corner
    var cornerValues = new Uint16Array(mesh.v.length);
    for (var i = 0; i < indices.length; i++) {
      cornerValues[indices[i]] = i; //indices[i] is the vertex value, i is the corner
    }  
    //console.log(normal)
    
    // Setup the new object.  you can add more data to this object if you like
    // to help with subdivision (for example)
    newObject = {
      boundingBox: [bb1, bb2],
      scaleFactor: 300/vec3.distance(bb1,bb2),
      center: [(xmax + xmin)/2, (ymax + ymin)/2, (zmax + zmin)/2],
      numElements: indices.length,
      arrays: {
        position: new Float32Array(position),
        normal: new Float32Array(normal),
        color: new Uint8Array(color),
        indices: new Uint16Array(indices)
      },
      vertexTable: new Uint16Array(indices),
      cornerTable: cornerValues,
      oppositeTable: new Uint16Array(indices.length),

      getVertex(corner: number) {
        return this.vertexTable[corner]
      },
      
      getNext(corner: number) {
        return (corner + 1) % 3 + this.getTriangle(corner) * 3;
      },
    
      getPrev(corner: number) {
        return this.getNext(this.getNext(corner))
      },
    
      getTriangle(corner: number) {
        return Math.floor(corner / 3)
      },
    
      getOpposite(corner: number) {
        return this.oppositeTable[corner]
      },
    
      getSwing(corner: number) {
        return this.getNext(this.getOpposite(this.getNext(corner)))
      },
    
      getLeft(corner: number) {
        return this.getOpposite(this.getNext(corner))
      },
    
      getRight(corner: number) {
        return this.getOpposite(this.getPrev(corner))
      }
    };

    for (var a = 0; a < newObject.arrays.indices.length; a++) {
      for (var b = 0; b < newObject.arrays.indices.length; b++) {
        if (newObject.getVertex(newObject.getNext(a)) == newObject.getVertex(newObject.getPrev(b)) 
          && newObject.getVertex(newObject.getPrev(a)) == newObject.getVertex(newObject.getNext(b))) {
            newObject.oppositeTable[a] = b;
            newObject.oppositeTable[b] = a;
          }
      }
    }
    //newObject.arrays.normal = new Float32Array(calcNorm(newObject))
    //console.log(newObject.arrays.normal)
    //console.log(newObject)
    //calcNorm(newObject)
    //console.log(normal)
}


//Recalculate the vertex normals
var calcNorm = function (obj: MeshObject) {
  var newPos = []
  for (var i = 0; i < obj.cornerTable.length; i++) {
    
    var curr = obj.cornerTable[i];
    var endFlag = false;
    var vertTotal = vec3.create()

    while (!endFlag) {
      
      //Vertex A
      var posIndA = obj.getVertex(obj.cornerTable[i]);
      var vertA = vec3.set(vec3.create(), obj.arrays.position[posIndA* 3], obj.arrays.position[posIndA * 3 + 1], obj.arrays.position[posIndA * 3 + 2]);
    
      //Vertex B
      var posIndB = obj.getVertex(obj.getNext(curr));
      var vertB = vec3.set(vec3.create(), obj.arrays.position[posIndB* 3], obj.arrays.position[posIndB * 3 + 1], obj.arrays.position[posIndB * 3 + 2]);
      
      //Vertex C
      var posIndC = obj.getVertex(obj.getPrev(curr)); 
      var vertC = vec3.set(vec3.create(), obj.arrays.position[posIndC* 3], obj.arrays.position[posIndC * 3 + 1], obj.arrays.position[posIndC * 3 + 2]);
      
      //Vector from A to B
      var vecBA = vec3.subtract(vec3.create(), vertB, vertA);

      //Vector from A to C
      var vecCA = vec3.subtract(vec3.create(), vertC, vertA);

      //Cross product
      var vecCross = vec3.cross(vec3.create(), vecBA, vecCA)
      //console.log(vecCross, i)
      vec3.add(vertTotal, vertTotal, vecCross)
      
      curr = obj.getSwing(curr);

      if (obj.cornerTable[i] == curr) {
        endFlag = true
        break
      }
    } 
    vertTotal = vec3.normalize(vertTotal, vertTotal)
    newPos.push(vertTotal[0], vertTotal[1], vertTotal[2])
  }
  //console.log(newPos)
  return newPos
}


// called periodically during download.  Some servers set the file size so 
// progres.lengthComputable is true, which lets us compute the progress
var onProgress = function (progress: ProgressEvent) {
  if (progress.lengthComputable) {
    progressGuage.value = progress.loaded / progress.total * 100;
  }
	console.log("loading: " + progress.loaded + " of " + progress.total +  "...");
}

// of there's an error, this will be called.  We'll log it to the console
var onError = function (error: string) {
	console.log("error! " + error);
}


//////////////////
// To add some globals to the Window object, Typescript requires us to be intentional.
// Here we extend the Window interface to include the properties we want to add
//
// HTML dom element callback functions.  Putting them on the window object makes 
// them visible to the DOM elements

declare global {
  interface Window {
    jsonFileChanged: () => void,
    loadModel: () => void,
    onSubdivide: () => void
  }
}

window.jsonFileChanged = () => {
   // we stored the filename in the select option items value property 
   filename.value = fileSelection.value;
}

window.loadModel = () => {
    // reset and show the progress bar
    progressGuage.max = 100;
    progressGuage.value = 0;
    progressGuage.style.visibility = "visible";
    
    // attempt to download the modele
    loader.loadMesh("models/" + filename.value, onLoad, onProgress, onError);
}



// TODO:  This is where all of your subdivision work will take place.
window.onSubdivide = () => {
  console.log("Subdivide called!  You should do the subdivision!");

  if (object == null) {
    return
  }

  var G = Array.from(object.arrays.position);
  var vecG: Array<number>[] = [];
  for (var i = 0; i < G.length/3; i++) {
    var temp: number[] = []
    temp.push(G[i * 3]);
    temp.push(G[i * 3 + 1]);
    temp.push(G[i * 3 + 2]);
    vecG.push(temp)
  }
  //console.log(vecG)

  var V = Array.from(object.arrays.indices)
  var W: number[] = [];
  var nc = object.arrays.indices.length;
  var nv = object.arrays.position.length/3;
  var nt = nc/3;

  function midPt (v1: number[], v2: number[]) {
    var retVec: number[] = []
    retVec.push((v1[0] + v2[0])/2, (v1[1] + v2[1])/2, (v1[2] + v2[2])/2);
    return retVec
  }
  
  function splitEdges() {
    if (object == null) {
      return
    }
    for (var i = 0; i < nc; i++) {
      if (i < object.getOpposite(i)) {
        var a = vecG[object.getVertex(object.getNext(i))];
        var b = vecG[object.getVertex(object.getPrev(i))];
        vecG[nv] = midPt(a, b);
        W[object.getOpposite(i)] = nv;
        W[i] = nv++;
        //console.log(vecG, object.getNext(i), object.getVertex(object.getNext(i)), a, b)
      }
    }
  }

  function addScaledVec(posVec: number[], scale: number, vec: number[]) {
    var scaledVec: number[] = [];
    scaledVec.push(vec[0] * scale, vec[1] * scale, vec[2] * scale);

    var retVec: number[] = [];
    retVec.push(posVec[0] + scaledVec[0], posVec[1] + scaledVec[1], posVec[2] + scaledVec[2])
    return retVec
  }

  function vecTo(v1: number[], v2: number[]) {
    var retVec: number[] = []
    retVec.push((v2[0] - v1[0]))
    retVec.push((v2[1] - v1[1]))
    retVec.push((v2[2] - v1[2]))
    return retVec
  }

  function bulge() { // tweaks the mid-edge vertices
    if (object == null) {
      return
    }
    for (var i = 0; i < nc; i++) {
      if (i < object.getOpposite(i)) { // no tweak for mid-vertices of border edges
        var midA = midPt(vecG[object.getVertex(object.getLeft(i))], vecG[object.getVertex(object.getRight(i))]);
        //console.log(object.getOpposite(i), object.getLeft(object.getOpposite(i)), vecG)
        var midB = midPt(vecG[object.getVertex(object.getLeft(object.getOpposite(i)))], 
          vecG[object.getVertex(object.getRight(object.getOpposite(i)))]);
        var mid1 = midPt(midA, midB);
        var mid2 = midPt(vecG[object.getVertex(i)], vecG[object.getVertex(object.getOpposite(i))]);
        vecG[W[i]] = addScaledVec(vecG[W[i]], 0.25, vecTo(mid1, mid2));
        //console.log(vecG)
        console.log("midA", "midB", "mid1", "mid2")
        console.log(midA)
        console.log(midB)
        console.log(mid1)
        console.log(mid2)
      }
    }
    //console.log(vecG)
  }

  function splitTriangles() { // splits each tirangle into 4
    if (object == null) {
      return
    }
    //console.log(V)
    for (var i = 0; i < 3 * nt; i = i + 3) {
      V[3 * nt + i] = V[i];
      V[object.getNext(3 * nt + i)] = W[object.getPrev(i)];
      V[object.getPrev(3 * nt + i)] = W[object.getNext(i)];
      V[6 * nt + i] = V[object.getNext(i)];
      V[object.getNext(6 * nt + i)] = W[i];
      V[object.getPrev(6 * nt + i)] = W[object.getPrev(i)];
      V[9 * nt + i] = V[object.getPrev(i)];
      V[object.getNext(9 * nt + i)] = W[object.getNext(i)];
      V[object.getPrev(9 * nt + i)] = W[i];
      V[i] = W[i];
      V[object.getNext(i)] = W[object.getNext(i)];
      V[object.getPrev(i)] = W[object.getPrev(i)];
    };
    nt = 4 * nt;
    nc = 3 * nt;
  }
  
  splitEdges();
  bulge();
  splitTriangles();

  var newColor: number[] = [];
  for (var ii = 0; ii < nv; ++ii) {
    // create a random color for the vertex
    var h = chroma.hsv(rand(360), 0.5, 1);
    var c = h.rgba();
    newColor.push(c[0], c[1], c[2], 255);
  }  

  var newCornerValues = new Uint16Array(V.length);
  for (var i = 0; i < V.length; i++) {
    newCornerValues[V[i]] = i; //indices[i] is the vertex value, i is the corner
  } 

  
  var newPosition = [];
  for (var i = 0; i < vecG.length; i++) {
    newPosition.push(vecG[i][0], vecG[i][1], vecG[i][2])
  }

  newObject = {
    boundingBox: object.boundingBox,
    scaleFactor: object.scaleFactor,
    center: object.center,
    numElements: nt * 3,
    arrays: {
      position: new Float32Array(newPosition),
      normal: new Float32Array(),
      color: new Uint8Array(newColor),
      indices: new Uint16Array(V)
    },
    vertexTable: new Uint16Array(V),
    cornerTable: newCornerValues,
    oppositeTable: new Uint16Array(V.length),
    getVertex(corner: number) {
      return this.vertexTable[corner]
    },
    
    getNext(corner: number) {
      return (corner + 1) % 3 + this.getTriangle(corner) * 3;
    },
  
    getPrev(corner: number) {
      return this.getNext(this.getNext(corner))
    },
  
    getTriangle(corner: number) {
      return Math.floor(corner / 3)
    },
  
    getOpposite(corner: number) {
      return this.oppositeTable[corner]
    },
  
    getSwing(corner: number) {
      return this.getNext(this.getOpposite(this.getNext(corner)))
    },
  
    getLeft(corner: number) {
      return this.getOpposite(this.getNext(corner))
    },
  
    getRight(corner: number) {
      return this.getOpposite(this.getPrev(corner))
    }
  };

  for (var a = 0; a < newObject.arrays.indices.length; a++) {
    for (var b = 0; b < newObject.arrays.indices.length; b++) {
      if (newObject.getVertex(newObject.getNext(a)) == newObject.getVertex(newObject.getPrev(b)) 
        && newObject.getVertex(newObject.getPrev(a)) == newObject.getVertex(newObject.getNext(b))) {
          newObject.oppositeTable[a] = b;
          newObject.oppositeTable[b] = a;
        }
    }
  }

  newObject.arrays.normal = Float32Array.from(calcNorm(newObject));
  //console.log(vecG, "vecG")
  //console.log(V, "V")
  //console.log(newPosition, "newPosition")
  //console.log(W, "W")
} 

////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////
// some simple interaction using the mouse.
// we are going to get small motion offsets of the mouse, and use these to rotate the object
//
// our offset() function from assignment 0, to give us a good mouse position in the canvas 
function offset(e: MouseEvent): GLM.IArray {
    e = e || <MouseEvent> window.event;

    var target = <Element> (e.target || e.srcElement),
        rect = target.getBoundingClientRect(),
        offsetX = e.clientX - rect.left,
        offsetY = e.clientY - rect.top;

    return vec2.fromValues(offsetX, offsetY);
}

var mouseStart: GLM.IArray | undefined = undefined;  // previous mouse position
var mouseDelta: GLM.IArray | undefined = undefined;  // the amount the mouse has moved
var mouseAngles = vec2.create();  // angle offset corresponding to mouse movement

// start things off with a down press
canvas.onmousedown = (ev: MouseEvent) => {
    mouseStart = offset(ev);        
    mouseDelta = vec2.create();  // initialize to 0,0
    vec2.set(mouseAngles, 0, 0);
}

// stop things with a mouse release
canvas.onmouseup = (ev: MouseEvent) => {
    if (mouseStart != undefined && mouseDelta != undefined) {
        const clickEnd = offset(ev);
        vec2.sub(mouseDelta, clickEnd, mouseStart);        // delta = end - start
        vec2.scale(mouseAngles, mouseDelta, 10/canvas.height);  

        // now toss the two values since the mouse is up
        mouseDelta = undefined;
        mouseStart = undefined; 
    }
}

// if we're moving and the mouse is down        
canvas.onmousemove = (ev: MouseEvent) => {
  if (mouseStart != undefined && mouseDelta != undefined) {
    const m = offset(ev);
      vec2.sub(mouseDelta, m, mouseStart);    // delta = mouse - start 
      vec2.copy(mouseStart, m);               // start becomes current position
      vec2.scale(mouseAngles, mouseDelta, 10/canvas.height);

      // console.log("mousemove mouseAngles: " + mouseAngles[0] + ", " + mouseAngles[1]);
      // console.log("mousemove mouseDelta: " + mouseDelta[0] + ", " + mouseDelta[1]);
      // console.log("mousemove mouseStart: " + mouseStart[0] + ", " + mouseStart[1]);
   }
}

// stop things if you move out of the window
canvas.onmouseout = (ev: MouseEvent) => {
    if (mouseStart != undefined) {
      vec2.set(mouseAngles, 0, 0);
      mouseDelta = undefined;
      mouseStart = undefined;
    }
}

////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////
// start things off by calling initWebGL
initWebGL();

function initWebGL() {
  // get the rendering context for webGL
  var gl: WebGLRenderingContext = getWebGLContext(canvas);
  if (!gl) {
    return;  // no webgl!  Bye bye
  }

  // turn on backface culling and zbuffering
  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);

  // attempt to download and set up our GLSL shaders.  When they download, processed to the next step
  // of our program, the "main" routing
  loader.loadFiles(['shaders/shader.vert', 'shaders/shader.frag'], function (shaderText: string[]) {
    var program = createProgramFromSources(gl, shaderText);
    main(gl, program);
  }, function (url: string) {
      alert('Shader failed to download "' + url + '"');
  }); 
}

////////////////////////////////////////////////////////////////////////////////////////////
// webGL is set up, and our Shader program has been created.  Finish setting up our webGL application       
function main(gl: WebGLRenderingContext, program: WebGLProgram) {
  
  // use the webgl-utils library to create setters for all the uniforms and attributes in our shaders.
  // It enumerates all of the uniforms and attributes in the program, and creates utility functions to 
  // allow "setUniforms" and "setAttributes" (below) to set the shader variables from a javascript object. 
  // The objects have a key for each uniform or attribute, and a value containing the parameters for the
  // setter function
  var uniformSetters = createUniformSetters(gl, program);
  var attribSetters  = createAttributeSetters(gl, program);

  /// ***************
  /// This code creates the initial 3D "F".  You can look here for guidance on what some of the elements
  /// of the "object" are, and may want to use the debugger to look at the content of the fields of the "arrays" 
  /// object returned from f3d.createArrays(gl) 
  var arrays = f3d.createArrays(gl);
  var bb1 = vec3.fromValues(100, 150, 30);
  var bb2 = vec3.fromValues(0, 0, 0);
  object = {
    boundingBox: [bb2,bb1],
    scaleFactor: 300/vec3.distance(bb1,bb2), 
    center: [50, 75, 15],
    numElements: arrays.indices.length,
    arrays: arrays, 
    vertexTable: arrays.indices,
    cornerTable: arrays.indices,
    oppositeTable: arrays.indices,

    getVertex(corner: number) {
      return this.vertexTable[corner]
    },
    
    getNext(corner: number) {
      return (corner + 1) % 3 + this.getTriangle(corner) * 3;
    },
  
    getPrev(corner: number) {
      return this.getNext(this.getNext(corner))
    },
  
    getTriangle(corner: number) {
      return Math.floor(corner / 3)
    },
  
    getOpposite(corner: number) {
      return this.oppositeTable[corner]
    },
  
    getSwing(corner: number) {
      return this.getNext(this.getOpposite(this.getNext(corner)))
    },
  
    getLeft(corner: number) {
      return this.getOpposite(this.getNext(corner))
    },
  
    getRight(corner: number) {
      return this.getOpposite(this.getPrev(corner))
    }
  }
  
  var buffers = {
    position: gl.createBuffer(),
    normal: gl.createBuffer(),
    color: gl.createBuffer(),
    indices: gl.createBuffer()
  };
  object.buffers = buffers;
      
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
  gl.bufferData(gl.ARRAY_BUFFER, arrays.position, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normal);
  gl.bufferData(gl.ARRAY_BUFFER, arrays.normal, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
  gl.bufferData(gl.ARRAY_BUFFER, arrays.color, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arrays.indices, gl.STATIC_DRAW);
  
  var attribs = {
    a_position: { buffer: buffers.position, numComponents: 3, },
    a_normal:   { buffer: buffers.normal,   numComponents: 3, },
    a_color:    { buffer: buffers.color,    numComponents: 4, type: gl.UNSIGNED_BYTE, normalize: true  }
  };
  
  function degToRad(d:number) {
    return d * Math.PI / 180;
  }

  var cameraAngleRadians = degToRad(0);
  var fieldOfViewRadians = degToRad(60);
  var cameraHeight = 50;

  var uniformsThatAreTheSameForAllObjects = {
    u_lightWorldPos:         [50, 30, -100],
    u_viewInverse:           mat4.create(),
    u_lightColor:            [1, 1, 1, 1],
    u_ambient:               [0.1, 0.1, 0.1, 0.1]
  };

  var uniformsThatAreComputedForEachObject = {
    u_worldViewProjection:   mat4.create(),
    u_world:                 mat4.create(),
    u_worldInverseTranspose: mat4.create(),
  };

  var baseColor = rand(240);
  var objectState = { 
      materialUniforms: {
        u_colorMult:             chroma.hsv(rand(baseColor, baseColor + 120), 0.5, 1).gl(),
        u_specular:              [1, 1, 1, 1],
        u_shininess:             450,
        u_specularFactor:        0.75,
      }
  };

  // some variables we'll reuse below
  var projectionMatrix = mat4.create();
  var viewMatrix = mat4.create();
  var rotationMatrix = mat4.create();
  var matrix = mat4.create();  // a scratch matrix
  var invMatrix = mat4.create();
  var axisVector = vec3.create();
  
  requestAnimationFrame(drawScene);

  // Draw the scene.
  function drawScene(time: number) {
    time *= 0.001; 

    // reset the object if a new one has been loaded
    if (newObject) {
      object = newObject;
      newObject = undefined;
      
      arrays = object.arrays;
      buffers = {
        position: gl.createBuffer(),
        normal: gl.createBuffer(),
        color: gl.createBuffer(),
        indices: gl.createBuffer()
      };
      object.buffers = buffers;
      
      // For each of the new buffers, load the array data into it. 
      // first, bindBuffer sets it as the "current Buffer" and then "bufferData"
      // loads the data into it.  Each array (vertex, color, normal)
      // has the same number of entries, and is used together by the shaders when it's
      // index is referenced by the index array for the triangle list
      
      // vertex positions
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
      gl.bufferData(gl.ARRAY_BUFFER, arrays.position, gl.STATIC_DRAW);

      // vertex normals
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normal);
      gl.bufferData(gl.ARRAY_BUFFER, arrays.normal, gl.STATIC_DRAW);

      // vertex colors
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
      gl.bufferData(gl.ARRAY_BUFFER, arrays.color, gl.STATIC_DRAW);

      // triangle indices.  
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arrays.indices, gl.STATIC_DRAW);

      // the attribute data to be used by the "setAttributes" utility function
      attribs = {
        a_position: { buffer: buffers.position, numComponents: 3, },
        a_normal:   { buffer: buffers.normal,   numComponents: 3, },
        a_color:    { buffer: buffers.color,    numComponents: 4, type: gl.UNSIGNED_BYTE, normalize: true  }
      }; 
      
      // reset the rotation matrix
      rotationMatrix = mat4.identity(rotationMatrix);     
    }    
   
    // measure time taken for the little stats meter
    stats.begin();

    // if the window changed size, reset the WebGL canvas size to match.  The displayed size of the canvas
    // (determined by window size, layout, and your CSS) is separate from the size of the WebGL render buffers, 
    // which you can control by setting canvas.width and canvas.height
    resizeCanvasToDisplaySize(canvas);

    // Set the viewport to match the canvas
    gl.viewport(0, 0, canvas.width, canvas.height);
    
    // Clear the canvas AND the depth buffer.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Compute the projection matrix
    var aspect = canvas.clientWidth / canvas.clientHeight;
    mat4.perspective(projectionMatrix,fieldOfViewRadians, aspect, 1, 2000);

    // Compute the camera's matrix using look at.
    var cameraPosition = [0, 0, -200];
    var target = [0, 0, 0];
    var up = [0, 1, 0];
    var cameraMatrix = mat4.lookAt(uniformsThatAreTheSameForAllObjects.u_viewInverse, cameraPosition, target, up);

    // Make a view matrix from the camera matrix.
    mat4.invert(viewMatrix, cameraMatrix);
    
    // tell WebGL to use our shader program.  probably don't need to do this each time, since we aren't
    // changing it, but it doesn't hurt in this simple example.
    gl.useProgram(program);
    
    // Setup all the needed attributes.   This utility function does the following for each attribute, 
    // where "index" is the index of the shader attribute found by "createAttributeSetters" above, and
    // "b" is the value of the entry in the "attribs" array cooresponding to the shader attribute name:
    //   gl.bindBuffer(gl.ARRAY_BUFFER, b.buffer);
    //   gl.enableVertexAttribArray(index);
    //   gl.vertexAttribPointer(
    //     index, b.numComponents || b.size, b.type || gl.FLOAT, b.normalize || false, b.stride || 0, b.offset || 0);    
    setAttributes(attribSetters, attribs);

    // Bind the indices for use in the index-based drawElements below
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);

    // Set the uniforms that are the same for all objects.  Unlike the attributes, each uniform setter
    // is different, depending on the type of the uniform variable.  Look in webgl-util.js for the
    // implementation of  setUniforms to see the details for specific types       
    setUniforms(uniformSetters, uniformsThatAreTheSameForAllObjects);
   
    ///////////////////////////////////////////////////////
    // Compute the view matrix and corresponding other matrices for rendering.
    
    // first make a copy of our rotationMatrix
    mat4.copy(matrix, rotationMatrix);
    
    // adjust the rotation based on mouse activity.  mouseAngles is set if user is dragging 
    if (mouseAngles[0] !== 0 || mouseAngles[1] !== 0) {
      // need an inverse world transform so we can find out what the world X axis for our first rotation is
      mat4.invert(invMatrix, matrix);
      // get the world X axis
      var xAxis = vec3.transformMat4(axisVector, vec3.fromValues(1,0,0), invMatrix);

      // rotate about the world X axis (the X parallel to the screen!)
      mat4.rotate(matrix, matrix, -mouseAngles[1], xAxis);
      
      // now get the inverse world transform so we can find the world Y axis
      mat4.invert(invMatrix, matrix);
      // get the world Y axis
      var yAxis = vec3.transformMat4(axisVector, vec3.fromValues(0,1,0), invMatrix);

      // rotate about teh world Y axis
      mat4.rotate(matrix, matrix, mouseAngles[0], yAxis);
  
      // save the resulting matrix back to the cumulative rotation matrix 
      mat4.copy(rotationMatrix, matrix);
      vec2.set(mouseAngles, 0, 0);        
    }   

    if (object) {
      // add a translate and scale to the object World xform, so we have:  R * T * S
      mat4.translate(matrix, rotationMatrix, [-object.center[0]*object.scaleFactor, -object.center[1]*object.scaleFactor, 
                                              -object.center[2]*object.scaleFactor]);
      mat4.scale(matrix, matrix, [object.scaleFactor, object.scaleFactor, object.scaleFactor]);
      mat4.copy(uniformsThatAreComputedForEachObject.u_world, matrix);

      // get proj * view * world
      mat4.multiply(matrix, viewMatrix, uniformsThatAreComputedForEachObject.u_world);
      mat4.multiply(uniformsThatAreComputedForEachObject.u_worldViewProjection, projectionMatrix, matrix);

      // get worldInvTranspose.  For an explaination of why we need this, for fixing the normals, see
      // http://www.unknownroad.com/rtfm/graphics/rt_normals.html
      mat4.transpose(uniformsThatAreComputedForEachObject.u_worldInverseTranspose, 
                    mat4.invert(matrix, uniformsThatAreComputedForEachObject.u_world));

      // Set the uniforms we just computed
      setUniforms(uniformSetters, uniformsThatAreComputedForEachObject);

      // Set the uniforms that are specific to the this object.
      setUniforms(uniformSetters, objectState.materialUniforms);

      // Draw the geometry.   Everything is keyed to the ""
      gl.drawElements(gl.TRIANGLES, object.numElements, gl.UNSIGNED_SHORT, 0);
    }
    // stats meter
    stats.end();

    requestAnimationFrame(drawScene);
  }
}

