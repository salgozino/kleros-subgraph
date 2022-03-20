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
import { getOrCreateCourt } from "./KlerosLiquidMappings";

let KLAddress = Address.fromString('{{kl_address}}')

export function handlePolicyUpdate(event: NewPolicyUpdateEvent): void {
  let subcourtId = event.params._subcourtID
  log.debug("handlePolicyUpdate: Storing new PolicyUpdate entity for subcourt {}",[subcourtId.toString()])  
  let entity = new PolicyUpdate(subcourtId.toString())
  entity.subcourtID = subcourtId
  entity.policy = event.params._policy
  entity.contractAddress = event.address
  entity.timestamp = event.block.timestamp
  entity.blockNumber = event.block.number
  entity.save()

  log.info("Trying to update new policy in court {}", [subcourtId.toString()])
  let court = getOrCreateCourt(subcourtId, KLAddress)
  if (court == null){
    return
  } else {
    log.info("Court found!, updating policy", [])
    court.policy = entity.id
    court.save()
  }

}
