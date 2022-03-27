import {
    log,
  } from "@graphprotocol/graph-ts";
  
import {
    PolicyUpdate as NewPolicyUpdateEvent,
  } from "../generated/PolicyRegistry/PolicyRegistry"
import {
    PolicyUpdate,
    Court
  } from "../generated/schema"


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
  let court = Court.load(subcourtId.toString())
  // if the court doesn't exist, the policy will be added when it's created.
  if (court !== null){
    log.info("Court found!, updating policy", [])
    court.policy = entity.id
    court.save()
  }

}
