import {
  StakeSet as StakeSetEvent,
  DisputeCreation as DisputeCreationEvent,
  Draw as DrawEvent,
  NewPeriod as NewPeriodEvent,
  TokenAndETHShift as TokenAndETHShiftEvent,
  AppealDecision as AppealDecisionEvent,
  CastVoteCall,
  KlerosLiquid, CreateSubcourtCall
  
} from "../generated/KlerosLiquid/KlerosLiquid"
import {
  PolicyUpdate as PolicyUpdateEvent
} from "../generated/PolicyRegistry/PolicyRegistry"
import {
  StakeSet,
  Draw,
  NewPeriod,
  Vote,
  Round,
  Dispute,
  Court,
  KlerosCounter
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
  log.info("handleStakeSet: stake set stored",[])
}

export function handleDisputeCreation(event: DisputeCreationEvent): void {
  log.debug("handleDisputeCreation: Creating a new dispute with id {}", [event.params._disputeID.toHex()])
  let entity = new Dispute(event.params._disputeID.toHex())
  entity.arbitrable = event.params._arbitrable
  entity.creator = event.transaction.from
  log.debug("handleDisputeCreation: asking the dispute {} to the contract", [event.params._disputeID.toHex()])
  let contract = KlerosLiquid.bind(event.address)
  let disputeData = contract.disputes(event.params._disputeID)
  let court = getOrCreateCourt(disputeData.value0, event.address)
  entity.subcourtID = court.id
  entity.numberOfChoices = disputeData.value2
  entity.lastPeriodChange = disputeData.value4
  entity.period = getPeriod(disputeData.value3)
  entity.startTime = event.block.timestamp
  entity.ruled = disputeData.value7
  log.debug("handleDisputeCreation: saving dispute {} entity",[event.params._disputeID.toHex()])
  entity.save()
  
  // round creation
  log.debug("handleDisputeCreation: Creating the round 0 for the dispute {}", [event.params._disputeID.toHex()])
  let round = new Round(event.params._disputeID.toHex()+"-"+BigInt.fromI32(0).toHex())
  round.dispute = entity.id
  round.startTime = event.block.timestamp
  round.winningChoice = getVoteCounter(event.params._disputeID, BigInt.fromI32(0), event.transaction.from)
  log.debug("handleDisputeCreation: saving the round 0 for the dispute {}", [event.params._disputeID.toHex()])
  round.save()
}

export function handleDraw(event: DrawEvent): void {
  let disputeID = event.params._disputeID
  let roundNumber = event.params._appeal
  let voteID = event.params._voteID
  log.info("handleDraw: Creating draw entity. disputeID={}, voteID={}, roundNumber={}", [disputeID.toHex(), voteID.toHex(), roundNumber.toHex()])
  let drawID = disputeID.toHex()+"-"+voteID.toHex()
  // create draw Entity
  let drawEntity = new Draw(drawID)
  drawEntity.address = event.params._address
  drawEntity.disputeId = event.params._disputeID
  drawEntity.roundNumber = event.params._appeal
  drawEntity.voteId = voteID
  drawEntity.timestamp = event.block.timestamp
  drawEntity.save()
  log.info("handleDraw: drawEntity stored",[])
  // create Vote entity
  log.info("handleDraw: Creating vote entity, id={} for the round {}", [drawID, roundNumber.toHex()])
  let round = Round.load(disputeID.toHex() + "-" + roundNumber.toHex())
  let dispute = Dispute.load(disputeID.toHex())
  log.debug("handleDraw: loaded round id is {}", [round.id])
  log.debug("handleDraw: loaded dispute id is {}", [dispute.id])
  let entity = new Vote(drawID)
  entity.address = event.params._address
  entity.dispute = dispute.id
  entity.round = round.id
  entity.voteID = voteID
  // define choice 0 and not voted
  entity.choice = BigInt.fromI32(0)
  entity.voted = false
  entity.save()
  log.debug("handleDraw: vote entity stored",[])
}

export function handleCastVote(call: CastVoteCall): void {
  let disputeID = call.inputs._disputeID
  let voteIDs = call.inputs._voteIDs
  log.debug("handleCastVote: Casting vote from dispute {}", [disputeID.toHex()])
  let dispute = Dispute.load(disputeID.toHex())
  if (dispute == null){
    log.error("handleCastVote: Error trying to load the dispute with id {}. The vote will not be stored", [disputeID.toHex()])
    return
  }
  
  // update votes
  for (let i = 0; i < voteIDs.length; i++) {
    let id = disputeID.toHex()+"-"+voteIDs[i].toHex()
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
  log.debug("handleCastVote: updating current rulling in the dispute {}",[disputeID.toHex()])
  dispute.currentRulling = getCurrentRulling(disputeID, call.to)
  dispute.save()
}

export function handleNewPeriod(event: NewPeriodEvent): void {
  let disputeID = event.params._disputeID
  log.debug("handleNewPeriod: new period for the dispute {}", [disputeID.toHex()])
  let entity = new NewPeriod(event.transaction.hash.toHex() + "-" + event.logIndex.toString())
  entity.newPeriod = getPeriod(event.params._period)
  entity.disputeId = event.params._disputeID
  entity.save()

  // update the dispute period
  log.debug("handleNewPeriod: Updating the dispute {} information", [disputeID.toHex()])
  let dispute = Dispute.load(disputeID.toHex())
  if (dispute == null){
    log.error("handleNewPeriod: Error trying to load the dispute with id {}. The new period will not be stored", [disputeID.toHex()])
    return
  }
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
  log.info("handleAppealDecision: New Appeal Decision raised for the dispute {}", [disputeID.toHex()])
  let dispute = Dispute.load(disputeID.toHex())
  if (dispute == null){
    log.error("handleAppealDecision: Error trying to load the dispute with id {}. The appeal will not be stored", [disputeID.toHex()])
    return
  }
  log.debug("handleAppealDecision: Dispute loaded with id {}",[dispute.id])
  
  // Iterate searching for the last round in this dispute
  let roundNum = BigInt.fromI32(0)
  let roundID = disputeID.toHex()+"-"+roundNum.toHex()
  let lastround = Round.load(roundID)
  do {
    roundNum = roundNum.plus(BigInt.fromI32(1))
    roundID = disputeID.toHex()+"-"+roundNum.toHex()
    log.debug("handleAppealDecision: searching for roundID {}",[roundID])
    lastround = Round.load(roundID)
  }
  while (lastround != null);

  log.debug("handleAppealDecision: new round number is {}. Round id = {}", [roundNum.toHex(), roundID])
  let round = new Round(roundID)
  round.dispute = dispute.id
  round.startTime = event.block.timestamp
  round.winningChoice = BigInt.fromI32(0) // initiate in pending
  round.save()
}

export function handleCreateSubcourt(call: CreateSubcourtCall): void {
  log.debug("handleCreateSubcourt: Asking for current court count", [])
  let kc = getOrInitializeKlerosCounter()
  
  log.debug("handleCreateSubcourt: Creating new court with id {}", [kc.courtsCount.toString()])
  getOrCreateCourt(kc.courtsCount, call.to)
  
  // update court counter
  kc.courtsCount = kc.courtsCount.plus(BigInt.fromI32(1))
  kc.save();
 
}

// Helper functions
function getPeriod(period: number): string {
  log.debug("getPeriod function: Asking period of number {}", [period.toString()])
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
  log.debug("getVoteCounter: Asking current rulling in the round {} of the dispute {}", [round.toHex(), disputeID.toHex()])
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

function getOrInitializeKlerosCounter(): KlerosCounter {
  let kc = KlerosCounter.load('ID')
  if (kc == null) {
    log.debug("getOrInitializeKlerosCounter: Initializing counters",[])
    kc = new KlerosCounter('ID')
    kc.courtsCount = BigInt.fromI32(0),
    kc.disputesCount = BigInt.fromI32(0),
    kc.openDisputes = BigInt.fromI32(0),
    kc.closedDisputes = BigInt.fromI32(0),
    kc.evidencePhaseDisputes = BigInt.fromI32(0),
    kc.votingPhaseDisputes = BigInt.fromI32(0),
    kc.appealPhaseDisputes = BigInt.fromI32(0),
    kc.activeJurors = BigInt.fromI32(0),
    kc.inactiveJurors = BigInt.fromI32(0),
    kc.tokenStaked = BigInt.fromI32(0)
    kc.save()
  } else{
    log.debug("getOrInitializeKlerosCounter: counters loaded",[])
  }
  return kc!
}

function getOrCreateCourt(subcourtID: BigInt, KLContract: Address): Court {
  let court = Court.load(subcourtID.toString())
  log.debug("getOrCreateCourt: Loading court {}",[court.id])
  if (court == null){
    court = new Court(subcourtID.toString())
    log.debug("getOrCreateCourt: Creating court {}",[court.id])
    court.subcourtID = subcourtID
    court.childs = []
    court.disputesNum = BigInt.fromI32(0)
    court.disputesClosed = BigInt.fromI32(0)
    court.disputesOngoing = BigInt.fromI32(0)
    court.activeJurors = BigInt.fromI32(0)
    court.tokenStaked = BigInt.fromI32(0)
    // get courtInputs from contract
    log.debug("getOrCreateCourt: Asking to the contract the parameters",[])
    let contract = KlerosLiquid.bind(KLContract)
    let courtObj = contract.courts(subcourtID)
    court.hiddenVotes =  courtObj.value1
    court.minStake = courtObj.value2
    court.alpha = courtObj.value3
    court.feeForJuror = courtObj.value4
    court.jurorsForCourtJump = courtObj.value5
    // get timePeriods
    let subcourtObj = contract.getSubcourt(subcourtID)
    court.timePeriods = subcourtObj.value1
    
    let parentCourtID = courtObj.value0
    if (parentCourtID != subcourtID){
      let parentCourt = getOrCreateCourt(parentCourtID,KLContract)
      court.parent = parentCourt.id
      // updating childs in parent court
      let childs = parentCourt.childs
      childs.push(court.id)
      parentCourt.childs = childs
      parentCourt.save()
    }

    log.debug("getOrCreateCourt: Saving court",[])
    court.save() 
  }
  return court!
}