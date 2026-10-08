import type { Point } from './model';

/** Projective transform from an actual rectangular sign plane to a four-corner facade selection. */
export function homography(width:number,height:number,corners:readonly Point[]):number[]{
 if(width<=0||height<=0||corners.length!==4)throw new Error('Invalid sign plane.');
 const source=[{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}];
 const matrix:number[][]=[];
 for(let i=0;i<4;i++){const {x,y}=source[i],u=corners[i].x,v=corners[i].y;matrix.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);}
 for(let col=0;col<8;col++){
  let pivot=col;for(let row=col+1;row<8;row++)if(Math.abs(matrix[row][col])>Math.abs(matrix[pivot][col]))pivot=row;
  if(Math.abs(matrix[pivot][col])<1e-9)throw new Error('The placement plane is too narrow or folded.');
  [matrix[col],matrix[pivot]]=[matrix[pivot],matrix[col]];const value=matrix[col][col];for(let c=col;c<9;c++)matrix[col][c]/=value;
  for(let row=0;row<8;row++)if(row!==col){const factor=matrix[row][col];for(let c=col;c<9;c++)matrix[row][c]-=factor*matrix[col][c];}
 }
 return [...matrix.map((row)=>row[8]),1];
}
export function projectPoint(m:readonly number[],p:Point):Point{const z=m[6]*p.x+m[7]*p.y+m[8];return{x:(m[0]*p.x+m[1]*p.y+m[2])/z,y:(m[3]*p.x+m[4]*p.y+m[5])/z};}
export function cssProjection(m:readonly number[]):string{return `matrix3d(${[m[0],m[3],0,m[6],m[1],m[4],0,m[7],0,0,1,0,m[2],m[5],0,1].join(',')})`;}
