/** Isolated Compass fixture; never reads or writes user data. */
const fs=require('node:fs'),path=require('node:path');
function draft(firstRooms=false,architecture=false){
  const all=Array.from({length:16},(_,i)=>`r${Math.floor(i/4)+1}_c${i%4+1}`);
  const grid=()=>Object.fromEntries(all.map(c=>[c,{roomId:null,anchorPlacementId:null,isExpandedChild:false}]));
  const definitions=architecture ? JSON.parse(fs.readFileSync(path.join(__dirname,'../python/tests/fixtures/compass_architectural_map.json'))).ground_floor.placements.map(p=>[p.roomId,p.room,p.cells]) : [['living','Living Hall',['r1_c1','r1_c2','r2_c1','r2_c2']],['masterbed','Master Bedroom',['r1_c3','r1_c4','r2_c3','r2_c4']],['kitchen','Kitchen + Store',['r3_c1','r3_c2','r4_c1','r4_c2']],['bathroom','Bathroom',['r3_c3','r3_c4','r4_c3','r4_c4']]];
  const placements=definitions.map(([roomId,roomLabel,occupiedCells],i)=>({placementId:`ground:p${i+1}`,roomId,roomLabel,occupiedCells,anchorCell:occupiedCells[0]}));
  const groundGrid=grid();for(const p of placements)for(const c of p.occupiedCells)groundGrid[c]={roomId:p.roomId,anchorPlacementId:p.placementId,isExpandedChild:c!==p.anchorCell};
  const firstGrid=grid();const first=firstRooms?[{placementId:'first:p1',roomId:'bedroom',roomLabel:'Bedroom',occupiedCells:['r4_c4'],anchorCell:'r4_c4'}]:[];
  if(firstRooms)firstGrid.r4_c4={roomId:'bedroom',anchorPlacementId:'first:p1',isExpandedChild:false};
  return {version:1,state:{phase:'placement',currentFloor:'first',foundation:{facing:'East',plotWidth:40,plotDepth:60,plotType:'Middle Plot',numFloors:'Multi-Floor',numBedrooms:'2',gatePosition:'Center'},foundationStep:7,grid:firstGrid,componentQueue:[],currentIndex:0,placements:first,armed:false,pendingExpansion:null,history:[],groundFloorData:{placements,grid:groundGrid,coveragePercent:100},firstFloorData:null,numFloors:'Multi-Floor'}};
}
module.exports=draft;
