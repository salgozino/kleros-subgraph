import {
    log,
    Address,
  } from "@graphprotocol/graph-ts";
  
import {
    PolicyUpdate as NewPolicyUpdateEvent,
  } from "../generated/PolicyRegistry/PolicyRegistry"
import {
    PolicyUpdate,
    Court
  } from "../generated/schema"
import {
  getOrCreateCourt
} from "./KlerosLiquidMappings"

let klContract = Address.fromString("0x988b3A538b618C7A603e1c11Ab82Cd16dbE28069")

export function handlePolicyUpdate(event: NewPolicyUpdateEvent): void {
  log.debug("handlePolicyUpdate: Storing new PolicyUpdate entity for subcourt {}",[event.params._subcourtID.toString()])  
  let entity = PolicyUpdate.load(event.params._subcourtID.toString())
  if (entity==null){
    entity = new PolicyUpdate(event.params._subcourtID.toString())
  }
  
  entity.subcourtID = event.params._subcourtID
  entity.policy = event.params._policy
  entity.contractAddress = event.address
  entity.timestamp = event.block.timestamp
  entity.blockNumber = event.block.number
  entity.save()

  //let court = getOrCreateCourt(event.params._subcourtID, klContract)
  //court.policy = entity.id
  //court.save()
  // the saving operation it's done, but the subgraph fails.
}
