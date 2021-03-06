const babylon = require( 'babylon' ); // https://github.com/babel/babylon
const defaultPickups = require( './default-pickups' ).map( parsePickup );

function grabStrings ( tokens, baseIndex, pickup ) {
  // the basic idea here is that until we find the end of the function
  // we concatinate strings as we find them. When we hit something that
  // isn't a string or allowed operator (paren, comma, plus) we stop adding
  // texts.
  //
  // _( "" )
  // _( "", "", lang )
  // _( ("") + "", lang )
  // _( "" + "", (lang + lang) )
  let nesting = 0;
  const strings = [ '' ];
  // is this a plural function?
  let index = baseIndex + 1;
  while ( index < tokens.length ) {
    const token = tokens[index];
    const type = token.type;
    const tokenIsString = type.label === 'string';
    // console.log( token.value, token.type.label )
    if ( tokenIsString ) {
      strings[strings.length - 1] += token.value;
    }
    else if ( type.label === '+' ) {
      // can ignore this token
      // it is special cased because "a" + "b" == "ab"
    }
    else if ( type.label === ',' ) {
      // create a new string in the chain
      strings.push( '' );
    }
    else if ( type.label === '(' ) {
      nesting += 1;
    }
    else if ( type.label === ')' ) {
      nesting -= 1;
      if ( nesting < 1 ) {
        // found the end
        break;
      }
    }
    else {
      // it's something else, like a variable or some other operator
      // we ignore it because the pickups may define arbitrary argument
      strings[strings.length - 1] = null;
    }
    index++;
  }
  // pull the expected arguments from the list of strings
  // all arguments must be emitted because we want test
  // to signal argument failure
  const terms = [];
  Array.from( pickup.useArgs )
    .sort( ( a, b ) => a - b )
    .map( idx => {
      terms.push( strings[idx] == null ? '' : strings[idx] );
    });
  return [ index, terms ];
}


function parseFile ( raw, pickups = defaultPickups, fn = '???' ) {
  const messages = [];
  const ast = babylon.parse( raw, {
    sourceFilename: fn,
    sourceType: 'module',
    plugins: [
      'asyncGenerators',
      'bigInt',
      'classPrivateMethods',
      'classPrivateProperties',
      'classProperties',
      'decorators',
      'decorators2',
      'doExpressions',
      'dynamicImport',
      'exportDefaultFrom',
      'exportNamespaceFrom',
      'functionBind',
      'functionSent',
      'importMeta',
      'jsx',
      'nullishCoalescingOperator',
      'numericSeparator',
      'objectRestSpread',
      'optionalCatchBinding',
      'optionalChaining',
      'pipelineOperator',
      'throwExpressions'
    ]
  });
  // index all tokens
  ast.tokens.forEach( ( token, i ) => { token.index = i; });
  // lookup table of pickups & args
  const ids = pickups.reduce( ( r, d ) => { r[d.id] = d; return r; }, {});
  // seek function names that exist in our whitelist
  let index = 0;
  while ( index < ast.tokens.length ) {
    const token = ast.tokens[index];
    const type = token.type;
    // found the function
    if ( type.label === 'name' && type.startsExpr && ids.hasOwnProperty( token.value ) ) {
      // is it being called
      if ( ( ast.tokens[index + 1] && ast.tokens[index + 1].type.label === '(' ) &&
           ( !ast.tokens[index - 1] || ast.tokens[index - 1].type.label !== 'function' ) ) {
        const [ idx, strings ] = grabStrings( ast.tokens, index, ids[token.value] );
        const pos = ast.tokens[index].loc.start;
        strings.forEach( string => {
          messages.push({
            text: string == null ? '' : string,
            file: fn,
            line: pos.line
          });
        });
        index = idx;
      }
    }
    index++;
  }
  return messages;
}


function parsePickup ( src ) {
  const [ id, args ] = src.split( ':', 2 );
  let useArgs = new Set();
  let maxArgs = 0;
  let contextArg = null;

  ( args || '1' ).split( ',' ).forEach( s => {
    // glib syntax ‘"msgctxt|msgid"’ is passed right through, sorry
    if ( /^\d+g?$/.test( s ) ) {
      const n = parseInt( s, 10 ) - 1;
      useArgs.add( n );
      maxArgs = Math.max( maxArgs, n + 1 );
    }
    else if ( /^\d+c$/.test( s ) ) {
      const n = parseInt( s, 10 ) - 1;
      contextArg = n;
      useArgs.delete( n ); // in case ARGst has already run
      maxArgs = Math.max( maxArgs, n + 1 );
    }
    else if ( /^\d+st$/.test( s ) ) {
      let n = parseInt( s, 10 );
      maxArgs = n;
      useArgs = new Set();
      while ( n-- ) {
        if ( n !== contextArg ) {
          useArgs.add( n );
        }
      }
    }
  });
  return { id, src, useArgs, maxArgs, contextArg };
}


exports.grabStrings = grabStrings;
exports.parseFile = parseFile;
exports.parsePickup = parsePickup;
