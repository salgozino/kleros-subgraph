import {
  StakeSet as StakeSetEvent,
  DisputeCreation as DisputeCreationEvent,
  Draw as DrawEvent,
  NewPeriod as NewPeriodEvent,
  TokenAndETHShift as TokenAndETHShiftEvent,
  AppealDecision as AppealDecisionEvent,
  CastVoteCall,
  KlerosLiquid, CreateSubcourtCall, KlerosLiquid__getVoteResult,
  
} from "../generated/KlerosLiquid/KlerosLiquid"
import {
  PolicyUpdate as PolicyUpdateEvent
} from "../generated/PolicyRegistry/PolicyRegistry"
import {
  StakeSet,
  Draw,
  NewPeriod,
  TokenAndETHShift,
  Vote,
  Round,
  Dispute
} from "../generated/schema"
import {
  log,
  TypedMap,
  Entity,
  store,
  Address,
  Bytes,
  BigInt,
  BigDecimal,
  json,
  ipfs
} from "@graphprotocol/graph-ts";


// Phase constants
// const EVIDENCE = 'evidence';
// const COMMIT = 'commit';
// const VOTE = 'vote';
// const APPEAL = 'appeal';
// const EXECUTION = 'execution';
enum Period {
  evidence = 0,
  commit,
  vote,
  appeal,
  execution
}


export function handleStakeSet(event: StakeSetEvent): void {
  log.debug("handleSetStake: creating a new setStake", [])
  let entity = new StakeSet(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  )
  entity.address = event.params._address
  entity.subcourtID = event.params._subcourtID
  entity.stake = event.params._stake
  entity.newTotalStake = event.params._newTotalStake
  entity.save()
}

export function handleDisputeCreation(event: DisputeCreationEvent): void {
  log.debug("handleDisputeCreation: Creating a new dispute with id {}", [event.params._disputeID.toString()])
  let entity = new Dispute(event.params._disputeID.toString())
  entity.arbitrable = event.params._arbitrable
  entity.creator = event.transaction.from
  log.debug("handleDisputeCreation: asking the dispute {} to the contract", [event.params._disputeID.toString()])
  let contract = KlerosLiquid.bind(event.address)
  let disputeData = contract.disputes(event.params._disputeID)
  entity.subcourtID = disputeData.value0
  entity.numberOfChoices = disputeData.value2
  entity.lastPeriodChange = disputeData.value4
  entity.period = getPeriod(disputeData.value3)
  entity.startTime = event.block.timestamp
  entity.ruled = disputeData.value7
  log.debug("handleDisputeCreation: saving dispute {} entity",[event.params._disputeID.toString()])
  entity.save()
  log.debug("handleDisputeCreation: Creating the round 0 for the dispute {}", [event.params._disputeID.toString()])
  let round = new Round(event.params._disputeID.toString()+"-"+BigInt.fromI32(0).toString())
  round.dispute = entity.id
  round.startTime = event.block.timestamp
  round.winningChoice = getVoteCounter(event.params._disputeID, BigInt.fromI32(0), event.transaction.from)
  log.debug("handleDisputeCreation: saving the round 0 for the dispute {}", [event.params._disputeID.toString()])
  round.save()
}

export function handleDraw(event: DrawEvent): void {
  let disputeID = event.params._disputeID
  let roundNumber = event.params._appeal
  let voteID = event.params._voteID
  log.debug("handleDraw: Creating draw entity. disputeID={}, voteID={}, roundNumber={}", [disputeID.toString(), voteID.toString(), roundNumber.toString()])
  let drawID = disputeID.toString()+"-"+voteID.toString()
  let drawEntity = new Draw(drawID)
  drawEntity.address = event.params._address
  drawEntity.disputeId = event.params._disputeID
  drawEntity.roundNumber = event.params._appeal
  drawEntity.voteId = voteID
  drawEntity.timestamp = event.block.timestamp
  drawEntity.save()

  log.debug("handleDraw: Creating vote entity, id={} for the round {}", [drawID, roundNumber.toString()])
  let round = Round.load(disputeID.toString() + "-" + roundNumber.toString())
  let dispute = Dispute.load(disputeID.toString())
  let entity = new Vote(drawID)
  entity.address = event.params._address
  entity.dispute = dispute.id
  entity.round = round.id
  entity.voteID = voteID
  // define choice 0 and not voted
  entity.choice = BigInt.fromI32(0)
  entity.voted = false
  entity.save()
}

export function handleCastVote(call: CastVoteCall): void {
  let disputeID = call.inputs._disputeID
  let voteIDs = call.inputs._voteIDs
  log.debug("handleCastVote: Casting vote from dispute {}", [disputeID.toString()])
  let dispute = Dispute.load(disputeID.toString())
  if (dispute == null){
    log.error("handleCastVote: Error trying to load the dispute with id {}. The vote will not be stored", [disputeID.toString()])
    return
  }
  let roundNum = dispute.rounds.length - 1 // round number is the number of rounds in the dispute.
  log.debug("handleCastVote: the round number is {} for the disputeID {}", [roundNum.toString(), disputeID.toString()])
  
  // update votes
  for (let i = 0; i < voteIDs.length; i++) {
    let id = disputeID.toString()+"-"+voteIDs[i].toString()
    log.debug("handleCastVote: Storing the vote {}",[id])
    let vote = Vote.load(id)
    if (vote == null){
      log.error("handleCastVote: Error trying to load the vote with id {}. The vote will not be stored", [id])
    }
    else{
      vote.choice = call.inputs._choice
      vote.salt = call.inputs._salt
      vote.voted = true
      vote.timestamp = call.block.timestamp
      vote.save()
    }
  } 

  // update dispute current rulling
  // log.debug("handleCastVote: updating current rulling in the dispute {}",[disputeID.toString()])
  // dispute.currentRulling = getCurrentRulling(disputeID, call.to)
  // dispute.save()

}

export function handleNewPeriod(event: NewPeriodEvent): void {
  let disputeID = event.params._disputeID
  log.debug("handleNewPeriod: new period for the dispute {}", [disputeID.toString()])
  let entity = new NewPeriod(event.transaction.hash.toHex() + "-" + event.logIndex.toString())
  entity.newPeriod = getPeriod(event.params._period)
  entity.disputeId = event.params._disputeID
  entity.save()

  // update the dispute period
  log.debug("handleNewPeriod: Updating the dispute {} information", [disputeID.toString()])
  let dispute = Dispute.load(disputeID.toString())
  dispute.period = getPeriod(event.params._period)
  if (event.params._period == 4) {
    dispute.ruled = true
  }
  dispute.lastPeriodChange = event.block.timestamp
  
  // update current rulling
  dispute.currentRulling = getCurrentRulling(disputeID, event.address)
  dispute.save()
}

export function handleTokenAndETHShift(event: TokenAndETHShiftEvent): void {
  
}


export function handlePolicyUpdate(event: PolicyUpdateEvent): void {

}

export function handleAppealDecision(event: AppealDecisionEvent): void{
  // Event  raised when a dispute is appealed
  let disputeID = event.params._disputeID
  log.debug("handleAppealDecision: New Appeal Decision raised for the dispute {}", [disputeID.toString()])
  let dispute = Dispute.load(disputeID.toString())
  let roundNum = dispute.rounds.length
  let round = new Round(disputeID.toString()+"-"+roundNum.toString())
  round.dispute = dispute.id
  round.startTime = event.block.timestamp
  round.winningChoice = BigInt.fromI32(0) // initiate in pending
  round.save()
}

function getPeriod(period: number): string {
  if (period == 0) {
    return 'evidence'
  }
  else if (period == 1){
    return 'commit'
  }
  else if (period == 2){
    return 'vote'
  }
  else if (period == 3){
    return 'appeal'
  }
  else if (period == 4){
    return 'execution'
  }
  return ''

}

function getCurrentRulling(disputeID: BigInt, address: Address): BigInt {
    log.debug("getCurrentRulling: Asking current rulling in dispute {}", [disputeID.toString()])
    let contract = KlerosLiquid.bind(address)
    let callResult = contract.try_currentRuling(disputeID)
    let currentRulling = BigInt.fromI32(0)
    if (callResult.reverted) {
      log.debug("getCurrentRulling: currentRulling reverted", [])
    } else {
      currentRulling = callResult.value
    }
    return currentRulling
}

function getVoteCounter(disputeID: BigInt, round: BigInt, address: Address): BigInt {
  log.debug("getVoteCounter: Asking current rulling in the round {} of the dispute {}", [round.toString(), disputeID.toString()])
  let contract = KlerosLiquid.bind(address)
  let callResult = contract.try_getVoteCounter(disputeID, round)
  let winningChoice = BigInt.fromI32(0)
  if (callResult.reverted) {
    log.debug("getVoteCounter: reverted", [])
  } else {
    winningChoice = callResult.value.value0
  }
  return winningChoice
}