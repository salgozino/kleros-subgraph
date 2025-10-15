/* eslint-disable prefer-const */
import {
  StakeSet as StakeSetEvent,
  DisputeCreation as DisputeCreationEvent,
  Draw as DrawEvent,
  NewPeriod as NewPeriodEvent,
  TokenAndETHShift as TokenAndETHShiftEvent,
  AppealDecision as AppealDecisionEvent,
  CastCommitCall,
  CastVoteCall,
  KlerosLiquid,
  CreateSubcourtCall,
  ChangeSubcourtMinStakeCall,
  ChangeSubcourtAlphaCall,
  ChangeSubcourtJurorFeeCall,
  ChangeSubcourtJurorsForJumpCall,
  ChangeSubcourtTimesPerPeriodCall
} from "../generated/KlerosLiquid/KlerosLiquid"
import {
  StakeSet,
  Draw,
  NewPeriod,
  Vote,
  Round,
  Dispute,
  Court,
  KlerosCounter,
  Juror,
  CourtStake,
  TokenAndETHShift,
  Arbitrable,
  PolicyUpdate
} from "../generated/schema"
import {
  log,
  Address,
  BigInt,
  Bytes
} from "@graphprotocol/graph-ts";



export function handleStakeSet(event: StakeSetEvent): void {
  log.debug("handleSetStake: creating a new setStake", [])

  let jurorStatus = checkJurorStatus(event.params._address, event.params._stake, event.params._newTotalStake, event.params._subcourtID)

  let entity = new StakeSet(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  )

  let juror = getOrCreateJuror(event.params._address, event.params._subcourtID, event.params._newTotalStake, event.address)
  entity.address = juror.id
  entity.subcourtID = event.params._subcourtID
  entity.stake = event.params._stake
  entity.newTotalStake = event.params._newTotalStake
  entity.blocknumber = event.block.number
  entity.timestamp = event.block.timestamp
  entity.gasCost = event.transaction.gasLimit.times(event.transaction.gasPrice)
  entity.save()
  log.debug("handleStakeSet: stake set stored", [])

  // update the juror entity and the courtStake
  updateJurorStake(event.params._address, event.params._subcourtID, event.params._stake,
    event.params._newTotalStake, event.block.timestamp, event.block.number, event.transaction.hash,
    jurorStatus, event.address)
}

export function handleDisputeCreation(event: DisputeCreationEvent): void {
  log.debug("handleDisputeCreation: Creating a new dispute with id {}", [event.params._disputeID.toString()])
  let dispute = new Dispute(event.params._disputeID.toString())
  let arbitrable = getOrCreateArbitrable(event.params._arbitrable)
  dispute.disputeID = event.params._disputeID
  dispute.arbitrable = arbitrable.id
  dispute.appealed = false;
  dispute.txid = event.transaction.hash

  // log.debug("handleDisputeCreation: asking the dispute {} to the contract", [event.params._disputeID.toString()])
  let contract = KlerosLiquid.bind(event.address)
  let disputeData = contract.disputes(event.params._disputeID)
  let court = getOrCreateCourt(disputeData.value0, event.address)
  // define creator
  // using the same naming for juror and creator as entities isn't the best practice
  let creator = getOrCreateJuror(event.transaction.from, null, BigInt.fromI32(0), event.address)
  dispute.creator = creator.id
  // sum +1 in the counter of the disputes created by this user
  creator.numberOfDisputesCreated = creator.numberOfDisputesCreated.plus(BigInt.fromI32(1))
  creator.save()

  dispute.subcourtID = court.id
  dispute.numberOfChoices = disputeData.value2
  dispute.lastPeriodChange = disputeData.value4
  dispute.period = getPeriodString(disputeData.value3)
  dispute.currentRulling = BigInt.fromI32(0)
  dispute.startTime = event.block.timestamp
  dispute.ruled = disputeData.value7
  dispute.jurorsInvolved = []
  dispute.numberOfRounds = BigInt.fromI32(1)
  dispute.numberOfCoherentVotes = BigInt.fromI32(0)
  dispute.numberOfVotes = BigInt.fromI32(0)
  dispute.coherency = BigInt.fromI32(0);
  log.debug("handleDisputeCreation: saving dispute {} entity",[event.params._disputeID.toString()])
  dispute.save()

  // round creation
  // log.debug("handleDisputeCreation: Creating the round 0 for the dispute {}", [event.params._disputeID.toString()])
  let roundID = getRoundId(event.params._disputeID, dispute.numberOfRounds.minus(BigInt.fromI32(1)))
  let round = new Round(roundID);
  round.dispute = dispute.id
  round.startTime = event.block.timestamp
  round.numberOfVotes = BigInt.fromI32(0)  // each vote it's added when draw
  round.numberOfCoherentVotes = BigInt.fromI32(0)  // each vote it's added when draw
  round.coherency = BigInt.fromI32(0); // initialize in 0
  round.winningChoice = BigInt.fromI32(0); // initialize in 0
  // log.debug("handleDisputeCreation: saving the round 0 for the dispute {}", [event.params._disputeID.toString()])
  round.save()

  //update counters
  // sum +1 in the court counter
  log.debug("handleDisputeCreation: Adding 1 in the disputesNum and disputesOngoing fields of the court {}", [court.id])
  court.disputesNum = court.disputesNum.plus(BigInt.fromI32(1))
  court.disputesOngoing = court.disputesOngoing.plus(BigInt.fromI32(1))
  court.evidencePhaseDisputes = court.evidencePhaseDisputes.plus(BigInt.fromI32(1))
  court.save()

  // add number of disputes in arbitrable
  // log.debug("handleDisputeCreation: Adding +1 in dispute counters for arbitrable {}", [arbitrable.id])
  arbitrable.disputesCount = arbitrable.disputesCount.plus(BigInt.fromI32(1))
  arbitrable.openDisputes = arbitrable.openDisputes.plus(BigInt.fromI32(1))
  arbitrable.evidencePhaseDisputes = arbitrable.evidencePhaseDisputes.plus(BigInt.fromI32(1))
  arbitrable.save()

  // Kleros Counters
  let kc = getOrInitializeKlerosCounter()
  // log.debug("handleDisputeCreation: Adding 1 in the disputesCount, openDisputes and evidencePhaseDisputes counter", [])
  kc.disputesCount = kc.disputesCount.plus(BigInt.fromI32(1))
  kc.openDisputes = kc.openDisputes.plus(BigInt.fromI32(1))
  kc.evidencePhaseDisputes = kc.evidencePhaseDisputes.plus(BigInt.fromI32(1))
  kc.save()
}

export function handleDraw(event: DrawEvent): void {
  let disputeID = event.params._disputeID
  let roundNumber = event.params._appeal
  let voteID = event.params._voteID

  let drawID = getVoteId(disputeID, roundNumber, voteID)
  // log.debug("handleDraw: Creating draw entity. disputeID={}, voteID={}, roundNumber={}. drawID={}",
  //    [disputeID.toString(), voteID.toString(), roundNumber.toString(), drawID])
  // create draw Entity
  let drawEntity = new Draw(drawID)
  drawEntity.address = event.params._address
  drawEntity.disputeId = event.params._disputeID
  drawEntity.roundNumber = event.params._appeal
  drawEntity.voteId = voteID
  drawEntity.timestamp = event.block.timestamp
  drawEntity.save()
  // log.debug("handleDraw: drawEntity stored",[])
  // create Vote entity
  log.debug("handleDraw: Creating vote entity, id={} for the round {}", [drawID, roundNumber.toString()])
  let roundID = getRoundId(disputeID, roundNumber);
  let round = Round.load(roundID)
  let dispute = Dispute.load(disputeID.toString())
  if (round === null || dispute === null ){
    log.error("handleDraw: Dispute {} and round {} not found", [roundID.toString(), disputeID.toString()]);
    return
  }
  let voteEntity = new Vote(drawID)
  let court = getOrCreateCourt(BigInt.fromString(dispute.subcourtID), event.address)
  let juror = getOrCreateJuror(event.params._address, BigInt.fromString(court.id), BigInt.fromI32(0), event.address)
  voteEntity.address = juror.id
  voteEntity.dispute = dispute.id
  voteEntity.round = round.id
  voteEntity.voteID = voteID
  // Define as null because the vote was not emmited yet
  voteEntity.choice = null
  voteEntity.voted = false

  voteEntity.commitGasUsed = BigInt.fromI32(0)
  voteEntity.commitGasPrice = BigInt.fromI32(0)
  voteEntity.commitGasCost = BigInt.fromI32(0)
  voteEntity.castGasUsed = BigInt.fromI32(0)
  voteEntity.castGasPrice = BigInt.fromI32(0)
  voteEntity.castGasCost = BigInt.fromI32(0)
  voteEntity.totalGasCost = BigInt.fromI32(0)
  voteEntity.coherent = false
  voteEntity.save()
  log.debug("handleDraw: vote entity stored", [])

  // it's the first vote of this juror?
  if (juror.numberOfDisputesAsJuror.equals(BigInt.fromI32(0))) {
    let kc = getOrInitializeKlerosCounter()
    log.debug("handleDraw: First time the juror {} is in a dispute, updating the global counter", [juror.id])
    kc.drawnJurors = kc.drawnJurors.plus(BigInt.fromI32(1))
    kc.save()

    juror.numberOfDisputesAsJuror = BigInt.fromI32(1)
    juror.save()
  }
  else {
    // check if the juror was drawn already in this dispute
    let alreadyDrawn = false
    for (let i = 0; i < voteID.toI32(); i++) {
      let tempDrawID = getVoteId(disputeID, roundNumber, BigInt.fromI32(i))
      let otherVote = Draw.load(tempDrawID)
      if (otherVote === null) {
        log.error("handleDraw: Could not found drawID {}", [tempDrawID.toString()]);
      } else {
        if (otherVote.address === event.params._address) {
          alreadyDrawn = true
        }
      }
    }
    // if wasn't drawn, sum 1 in the counter
    if (!alreadyDrawn) {
      juror.numberOfDisputesAsJuror = juror.numberOfDisputesAsJuror.plus(BigInt.fromI32(1))
      juror.save()
    }
  }
  // add jurors involved in the dispute
  let jurors_involved = dispute.jurorsInvolved
  jurors_involved.push(juror.id)
  dispute.jurorsInvolved = jurors_involved
  // log.debug('handleDraw: Adding juror {} to dispute {}', [juror.id, dispute.id])

  dispute.save()
}

export function handleCastCommit(call: CastCommitCall): void {
  let disputeID = call.inputs._disputeID
  let voteIDs = call.inputs._voteIDs
  let commit = call.inputs._commit
  // log.debug("handleCastVote: Casting vote from dispute {}", [disputeID.toString()])
  let dispute = Dispute.load(disputeID.toString())
  if (dispute == null) {
    log.error("handleCastVote: Error trying to load the dispute with id {}. The vote will not be stored", [disputeID.toString()])
    return
  }
  let roundNum = getLastRound(disputeID)

  // update votes
  for (let i = 0; i < voteIDs.length; i++) {
    let id = getVoteId(disputeID, roundNum, voteIDs[i])
    log.debug("handleCastVote: Storing the vote {}", [id])
    let vote = Vote.load(id)
    if (vote == null) {
      log.error("handleCastVote: Error trying to load the vote with id {}. The vote will not be stored", [id])
    }
    else {
      vote.voted = true
      vote.timestamp = call.block.timestamp
      vote.commit = commit
      vote.commitGasUsed = call.transaction.gasLimit
      vote.commitGasPrice = call.transaction.gasPrice
      vote.commitGasCost = vote.commitGasUsed.times(vote.commitGasPrice)
      vote.totalGasCost = vote.totalGasCost.plus(vote.commitGasCost)
      vote.save()

      let juror = getOrCreateJuror(call.from, BigInt.fromI32(0), BigInt.fromI32(0), call.to);
      juror.totalGasCost = juror.totalGasCost.plus(vote.commitGasCost)
      juror.save()
    }
  }
  dispute.save()
}

export function handleCastVote(call: CastVoteCall): void {
  let disputeID = call.inputs._disputeID
  let voteIDs = call.inputs._voteIDs
  log.debug("handleCastVote: Casting vote from dispute {}", [disputeID.toString()])
  let dispute = Dispute.load(disputeID.toString())
  if (dispute == null) {
    log.error("handleCastVote: Error trying to load the dispute with id {}. The vote will not be stored", [disputeID.toString()])
    return
  }
  let roundNum = getLastRound(disputeID)

  // update votes
  for (let i = 0; i < voteIDs.length; i++) {
    let id = getVoteId(disputeID, roundNum, voteIDs[i])
    log.debug("handleCastVote: Storing the vote {}", [id])
    let vote = Vote.load(id)
    if (vote == null) {
      log.error("handleCastVote: Error trying to load the vote with id {}. The vote will not be stored", [id])
    }
    else {
      vote.choice = call.inputs._choice
      vote.salt = call.inputs._salt
      vote.voted = true
      vote.timestamp = call.block.timestamp
      vote.castGasUsed = call.transaction.gasLimit
      vote.castGasPrice = call.transaction.gasPrice
      vote.castGasCost = vote.castGasUsed.times(vote.castGasPrice)
      vote.totalGasCost = vote.totalGasCost.plus(vote.castGasCost)
      vote.save()

      let juror = getOrCreateJuror(call.from, BigInt.fromString(dispute.subcourtID), BigInt.fromI32(0), call.to);
      juror.totalGasCost = juror.totalGasCost.plus(vote.castGasCost)
      juror.save()
    }
  }

  // update dispute current rulling
  log.debug("handleCastVote: updating current rulling in the dispute {}", [disputeID.toString()])
  dispute.currentRulling = getCurrentRulling(disputeID, call.to)
  dispute.save()
}

export function handleNewPeriod(event: NewPeriodEvent): void {
  let disputeID = event.params._disputeID
  log.debug("handleNewPeriod: new period for the dispute {}", [disputeID.toString()])
  let period = new NewPeriod(event.transaction.hash.toHex() + "-" + event.logIndex.toString())
  period.newPeriod = getPeriodString(event.params._period)
  period.disputeId = disputeID
  period.blockNumber = event.block.number
  period.save()

  // update the dispute period
  let dispute = Dispute.load(disputeID.toString())
  if (dispute == null) {
    log.error("handleNewPeriod: Error trying to load the dispute with id {}. The new period will not be stored", [disputeID.toString()])
    return
  }

  // update counters.
  // avoid period == 0, because was handled in disputeCreation, this is just in xDAI, in mainnet the
  // newPeriod event it's not emmited when the dispute it's created.
  // The same when an appeal is raised. The counters are handled in the AppealDecision Event because in mainnet
  // the event NewPeriod it's not emmited (oldPeriod = Appeal & newPeriod != execution)
  let oldPeriod = dispute.period
  dispute.currentRulling = getCurrentRulling(disputeID, event.address);
  dispute.period = getPeriodString(event.params._period)
  dispute.lastPeriodChange = event.block.timestamp

  if ( (event.params._period !== 0) && !(oldPeriod == getPeriodString(3) && event.params._period !== 4)){
    let kc = getOrInitializeKlerosCounter()
    let arbitrable = getOrCreateArbitrable(Address.fromString(dispute.arbitrable))
    let court = getOrCreateCourt(BigInt.fromString(dispute.subcourtID), event.address)
    // Update new period counters
    if (event.params._period == 4) {
      // executing rulling
      dispute.ruled = true
      
      log.debug("handleNewPeriod: Period 4: updating disputes ongoing and closed in court {} entity", [court.id])
      court.disputesOngoing = court.disputesOngoing.minus(BigInt.fromI32(1))
      court.disputesClosed = court.disputesClosed.plus(BigInt.fromI32(1))
      
      // update counters
      log.debug("handleNewPeriod: Updating KC parameters in period 4. +1 for closed disputes, -1 for openDisputes", [])
      kc.openDisputes = kc.openDisputes.minus(BigInt.fromI32(1))
      kc.closedDisputes = kc.closedDisputes.plus(BigInt.fromI32(1))
      // update arbitrable count
      arbitrable.openDisputes = arbitrable.openDisputes.minus(BigInt.fromI32(1))
      arbitrable.closedDisputes = arbitrable.closedDisputes.plus(BigInt.fromI32(1))
      // update appealPercentage
      if (dispute.appealed) {
        court.disputesAppealed = court.disputesAppealed.plus(BigInt.fromI32(1));
        kc.disputesAppealed = kc.disputesAppealed.plus(BigInt.fromI32(1));
      }
      if (court.disputesClosed.gt(BigInt.fromI32(0))) {
        court.appealPercentage = court.disputesAppealed.times(BigInt.fromI32(100)).div(court.disputesClosed)
      }
      if (kc.closedDisputes.gt(BigInt.fromI32(0))) {
        kc.appealPercentage = kc.disputesAppealed.times(BigInt.fromI32(100)).div(kc.closedDisputes)
      }
      // update coherency
      log.debug('handleNewPeriod: Updating coherency counters for dispute {}', [dispute.id])
      log.debug("handleNewPeriod: dispute currenRulling {}", [dispute.currentRulling.toString()])
      for (let rIndex = 0; rIndex < dispute.numberOfRounds.toI32(); rIndex++) {
        let roundID = getRoundId(BigInt.fromString(dispute.id), BigInt.fromI32(rIndex))
        let round = Round.load(roundID)
        if (round === null){
          log.error("handleNewPeriod: Round {} not found.", [dispute.id.toString()+"-"+BigInt.fromI32(rIndex).toString()]);
          continue
        }
        log.debug('handleNewPeriod: searching in Round {} to update coherency', [round.id]);
        let vIndex = 0;
        while (true) {
          let voteId = getVoteId(BigInt.fromString(dispute.id), BigInt.fromI32(rIndex), BigInt.fromI32(vIndex))
          let vote = Vote.load(voteId)
          if (vote === null){
            break
          }
          let juror = getOrCreateJuror(Address.fromString(vote.address), null, BigInt.fromI32(0), event.address)

          round.numberOfVotes = round.numberOfVotes.plus(BigInt.fromI32(1))
          dispute.numberOfVotes = dispute.numberOfVotes.plus(BigInt.fromI32(1))
          court.numberOfVotes = court.numberOfVotes.plus(BigInt.fromI32(1))
          juror.numberOfVotes = juror.numberOfVotes.plus(BigInt.fromI32(1))
          
          if (vote.choice !== null){
            log.debug("handleNewPeriod: Coherency: Vote choice {} = Dispute rulling {}?",
              [vote.choice!.toString(), dispute.currentRulling.toString()]);
            if (vote.choice!.equals(dispute.currentRulling)) {
              vote.coherent = true;
              juror.numberOfCoherentVotes = juror.numberOfCoherentVotes.plus(BigInt.fromI32(1))
              round.numberOfCoherentVotes = round.numberOfCoherentVotes.plus(BigInt.fromI32(1))
              dispute.numberOfCoherentVotes = dispute.numberOfCoherentVotes.plus(BigInt.fromI32(1))
              court.numberOfCoherentVotes = court.numberOfCoherentVotes.plus(BigInt.fromI32(1))
            }
          }
          log.debug('handleNewPeriod: Updating coherency of vote {}', [vote.id])

          // Update coherency metrics
          if (court.numberOfVotes.gt(BigInt.fromI32(0))) {
            court.coherency = court.numberOfCoherentVotes.times(BigInt.fromI32(100)).div(court.numberOfVotes)
          }
          if (juror.numberOfVotes.gt(BigInt.fromI32(0))) {
            juror.coherency = juror.numberOfCoherentVotes.times(BigInt.fromI32(100)).div(juror.numberOfVotes)
          }
          vote.save()
          juror.save()

          vIndex++;
        }
        if (round.numberOfVotes.gt(BigInt.fromI32(0))) {
          round.coherency = round.numberOfCoherentVotes.times(BigInt.fromI32(100)).div(round.numberOfVotes)
        }
        round.save()
      }
    } else if (event.params._period==3){
      // moving to appeal phase
      log.debug("handleNewPeriod: Updating KC parameters in period 3. +1 for appealPhase", [])
      kc.appealPhaseDisputes = kc.appealPhaseDisputes.plus(BigInt.fromI32(1))
      arbitrable.appealPhaseDisputes = arbitrable.appealPhaseDisputes.plus(BigInt.fromI32(1))
      court.appealPhaseDisputes = court.appealPhaseDisputes.plus(BigInt.fromI32(1));

    } else if (event.params._period == 2) {
      // moving to voting phase
      log.debug("handleNewPeriod: Updating KC parameters in period 2. +1 for votingPhase", [])
      kc.votingPhaseDisputes = kc.votingPhaseDisputes.plus(BigInt.fromI32(1))
      arbitrable.votingPhaseDisputes = arbitrable.votingPhaseDisputes.plus(BigInt.fromI32(1))
      court.votingPhaseDisputes = court.votingPhaseDisputes.plus(BigInt.fromI32(1));
    } else if (event.params._period == 1) {
      // moving to commit phase
      log.debug("handleNewPeriod: Updating KC parameters in period 1!. +1 for commitPhase disputes", [])
      kc.commitPhaseDisputes = kc.commitPhaseDisputes.plus(BigInt.fromI32(1))
      arbitrable.commitPhaseDisputes = arbitrable.commitPhaseDisputes.plus(BigInt.fromI32(1))
      court.commitPhaseDisputes = court.commitPhaseDisputes.plus(BigInt.fromI32(1));
    } else {
      // This should never be met...
      log.warning("handleNewPeriod: New period not handled for counters. Value {}", [dispute.period])
    }
    // Update old period counters
    if (oldPeriod == getPeriodString(0)) {
      // old period was Evidence
      log.debug("handleNewPeriod: Updating KC parameters in old period evidence. Minus 1 for evidence", [])
      kc.evidencePhaseDisputes = kc.evidencePhaseDisputes.minus(BigInt.fromI32(1))
      arbitrable.evidencePhaseDisputes = arbitrable.evidencePhaseDisputes.minus(BigInt.fromI32(1))
      court.evidencePhaseDisputes = court.evidencePhaseDisputes.minus(BigInt.fromI32(1));
      if (kc.evidencePhaseDisputes.lt(BigInt.fromI32(0))) {
        log.error("handleNewPeriod: KC evidence count < 0", [])
      }
      if (arbitrable.evidencePhaseDisputes.lt(BigInt.fromI32(0))) {
        log.error("handleNewPeriod: Arbitrable {} evidence count < 0", [arbitrable.id])
      }
    } else if (oldPeriod == getPeriodString(1)) {
      // old period was commit
      log.debug("handleNewPeriod: Updating KC parameters in old period commit. Minus 1 for commit", [])
      kc.commitPhaseDisputes = kc.commitPhaseDisputes.minus(BigInt.fromI32(1))
      arbitrable.commitPhaseDisputes = arbitrable.commitPhaseDisputes.minus(BigInt.fromI32(1))
      court.commitPhaseDisputes = court.commitPhaseDisputes.minus(BigInt.fromI32(1));
      if (kc.commitPhaseDisputes.lt(BigInt.fromI32(0))) {
        log.error("handleNewPeriod: KC commit count < 0", [])
      }
      if (arbitrable.commitPhaseDisputes.lt(BigInt.fromI32(0))) {
        log.error("handleNewPeriod: Arbitrable {} commit count < 0", [arbitrable.id])
      }
    } else if (oldPeriod == getPeriodString(2)) {
      // oldPeriod was vote
      log.debug("handleNewPeriod: Updating KC parameters in old period vote. Minus 1 for vote", [])
      kc.votingPhaseDisputes = kc.votingPhaseDisputes.minus(BigInt.fromI32(1))
      arbitrable.votingPhaseDisputes = arbitrable.votingPhaseDisputes.minus(BigInt.fromI32(1))
      court.votingPhaseDisputes = court.votingPhaseDisputes.minus(BigInt.fromI32(1))
      if (kc.votingPhaseDisputes.lt(BigInt.fromI32(0))) {
        log.error("handleNewPeriod: KC vote count < 0", [])
      }
      if (arbitrable.votingPhaseDisputes.lt(BigInt.fromI32(0))) {
        log.error("handleNewPeriod: Arbitrable {} vote count < 0", [arbitrable.id])
      }
    } else if (oldPeriod == getPeriodString(3)) {
      // old period appeal
      log.debug("handleNewPeriod: Updating KC parameters in old period appeal. Minus 1 for appeal", [])
      kc.appealPhaseDisputes = kc.appealPhaseDisputes.minus(BigInt.fromI32(1))
      arbitrable.appealPhaseDisputes = arbitrable.appealPhaseDisputes.minus(BigInt.fromI32(1))
      court.appealPhaseDisputes = court.appealPhaseDisputes.minus(BigInt.fromI32(1))
      if (kc.appealPhaseDisputes.lt(BigInt.fromI32(0))) {
        log.error("handleNewPeriod: KC appeal count < 0", [])
      }
      if (arbitrable.appealPhaseDisputes.lt(BigInt.fromI32(0))) {
        log.error("handleNewPeriod: Arbitrable {} appeal count < 0", [arbitrable.id])
      }
    } else {
      log.warning("handleNewPeriod: Old Period {} not handled.", [oldPeriod])
    }
    kc.save()
    arbitrable.save()
    court.save()
  } else {
    log.info("handleNewPeriod: Counter dissmiss because period it's equal to {} and old period it's {}",
      [getPeriodString(event.params._period), oldPeriod])
  }

  if (dispute.numberOfVotes.gt(BigInt.fromI32(0))) {
    dispute.coherency = dispute.numberOfCoherentVotes.times(BigInt.fromI32(100)).div(dispute.numberOfVotes)
  }
  dispute.save()
}

export function handleTokenAndETHShift(event: TokenAndETHShiftEvent): void {
  let entity = new TokenAndETHShift(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
    )
  let dispute = Dispute.load(event.params._disputeID.toString())
  if (dispute === null ){
    log.error("handleTokenAndETHShift: Dispute {} could not be found", [event.params._disputeID.toString()])
    return
  }
  let juror = getOrCreateJuror(event.params._address, null, BigInt.fromI32(0), event.address)
  entity.disputeId = dispute.id
  entity.tokenAmount = event.params._tokenAmount
  entity.ETHAmount = event.params._ETHAmount
  entity.address = juror.id
  entity.blockNumber = event.block.number
  entity.timestamp = event.block.timestamp
  entity.save()

  // saving in juror entity
  juror.ethRewards = juror.ethRewards.plus(event.params._ETHAmount)
  juror.tokenRewards = juror.tokenRewards.plus(event.params._tokenAmount)
  juror.save()

  // saving in kleros counter entity
  let kc = getOrInitializeKlerosCounter()
  kc.totalETHFees = kc.totalETHFees.plus(event.params._ETHAmount)
  if (event.params._tokenAmount.gt(BigInt.fromI32(0))) {
    // just the positive transfers, if positive considered, 
    kc.totalTokenRedistributed = kc.totalTokenRedistributed.plus(event.params._tokenAmount)
  }
  kc.save()

  // saving in court entity
  let court = getOrCreateCourt(BigInt.fromString(dispute.subcourtID), event.address)
  court.totalETHFees = court.totalETHFees.plus(event.params._ETHAmount)
  if (event.params._tokenAmount.gt(BigInt.fromI32(0))) {
    // just the positive transfers, if positive considered, 
    court.totalTokenRedistributed = court.totalTokenRedistributed.plus(event.params._tokenAmount)
  }
  court.save()

  // add the eth reward to the arbitrable 
  let arbitrble = getOrCreateArbitrable(Address.fromString(dispute.arbitrable))
  arbitrble.ethFees = arbitrble.ethFees.plus(event.params._ETHAmount)
  arbitrble.save()

}

export function handleAppealDecision(event: AppealDecisionEvent): void {
  // Event  raised when a dispute is appealed
  let disputeID = event.params._disputeID
  log.debug("handleAppealDecision: New Appeal Decision raised for the dispute {}", [disputeID.toString()])
  let dispute = Dispute.load(disputeID.toString())
  if (dispute == null) {
    log.error("handleAppealDecision: Error trying to load the dispute with id {}. The appeal will not be stored", [disputeID.toString()])
    return
  }
  // log.debug("handleAppealDecision: Dispute loaded with id {}",[dispute.id])

  let roundNum = dispute.numberOfRounds
  // adding 1 to create the new round
  let roundID = getRoundId(disputeID, roundNum)
  log.debug("handleAppealDecision: new round number is {}. Round id = {}", [roundNum.toString(), roundID])
  let round = new Round(roundID)
  round.dispute = dispute.id
  round.startTime = event.block.timestamp
  round.numberOfVotes = BigInt.fromI32(0) // each vote it's added when draw
  round.numberOfCoherentVotes = BigInt.fromI32(0) // each vote it's added when draw
  round.coherency = BigInt.fromI32(0);
  round.winningChoice = BigInt.fromI32(0) // initiate in pending
  round.save()
  // Check if dispute is not jumped to parent court
  let contract = KlerosLiquid.bind(event.address)
  let disputeData = contract.disputes(disputeID)
  dispute.period = getPeriodString(disputeData.value3)
  dispute.numberOfRounds = dispute.numberOfRounds.plus(BigInt.fromI32(1))
  dispute.appealed = true;
  dispute.save()
  if (disputeData.value3 !== 0) {
    log.error("handleAppealDecision: Assuming evidence as new period is wrong!, new period is {}", [dispute.period])
  }

  let oldcourt = getOrCreateCourt(BigInt.fromString(dispute.subcourtID), event.address)
  let court = getOrCreateCourt(disputeData.value0, event.address)
  if (oldcourt.id != court.id) {
    log.debug("handleAppealDecision: courtJump! in dispute {}. oldCourt it's {} and New court it's {} ", [dispute.id, oldcourt.id, court.id])
    dispute.subcourtID = court.id
    dispute.save()
    // update oldcourt counters
    log.debug("handleAppealDecision: Decreasing in 1 due to courtJump disputesOngoing and disputesNum in the old court {}", [oldcourt.id])
    oldcourt.disputesOngoing = oldcourt.disputesOngoing.minus(BigInt.fromI32(1))
    oldcourt.disputesNum = oldcourt.disputesNum.minus(BigInt.fromI32(1))
    oldcourt.appealPhaseDisputes = oldcourt.appealPhaseDisputes.minus(BigInt.fromI32(1))
    oldcourt.save()
    // update new court counters
    log.debug("handleAppealDecision: Increasing in 1 due to courtJump disputesNum and disputesOngoing in the new court {}", [court.id])
    court.disputesNum = court.disputesNum.plus(BigInt.fromI32(1))
    court.disputesOngoing = court.disputesOngoing.plus(BigInt.fromI32(1))
    court.evidencePhaseDisputes = court.evidencePhaseDisputes.plus(BigInt.fromI32(1))
    court.save()
  } else {
    court.appealPhaseDisputes = court.appealPhaseDisputes.minus(BigInt.fromI32(1));
    court.evidencePhaseDisputes = court.evidencePhaseDisputes.plus(BigInt.fromI32(1));
    court.save()
  }

  // Update KlerosCounters and Arbitrable
  let kc = getOrInitializeKlerosCounter()
  log.debug("handleAppealDecision: Adding 1 in evidence phase disputes and -1 to appeal phase disputes in the KC and arbitrable", [])
  kc.evidencePhaseDisputes = kc.evidencePhaseDisputes.plus(BigInt.fromI32(1))
  kc.appealPhaseDisputes = kc.appealPhaseDisputes.minus(BigInt.fromI32(1))
  kc.save()

  let arbitrable = getOrCreateArbitrable(Address.fromString(dispute.arbitrable))
  arbitrable.evidencePhaseDisputes = arbitrable.evidencePhaseDisputes.plus(BigInt.fromI32(1))
  arbitrable.appealPhaseDisputes = arbitrable.appealPhaseDisputes.minus(BigInt.fromI32(1))
  arbitrable.save()
  if (arbitrable.appealPhaseDisputes.lt(BigInt.fromI32(0))) {
    log.error("handleAppealDecision: arbitrable {} appeal dispute counter < 0", [arbitrable.id])
  }
  if (kc.appealPhaseDisputes.lt(BigInt.fromI32(0))) {
    log.error("handleAppealDecision: KC appeal dispute counter < 0", [arbitrable.id])
  }
}

export function handleCreateSubcourt(call: CreateSubcourtCall): void {
  // log.debug("handleCreateSubcourt: Asking for current court count", [])
  let kc = getOrInitializeKlerosCounter()
  
  log.info("handleCreateSubcourt: Creating new court with id {}", [kc.courtsCount.toString()])
  getOrCreateCourt(kc.courtsCount, call.to)
  // if the court it's created, the counter of KlerosCounter is incremented wihtin the getorCreateCourt
}

export function handleChangeSubcourtMinStake(call: ChangeSubcourtMinStakeCall): void {
  log.info("handleChangeSubcourtMinStake: Updating minstake of court {}", [call.inputs._subcourtID.toString()])
  let court = getOrCreateCourt(call.inputs._subcourtID, call.to)
  court.minStake = call.inputs._minStake
  court.save()
}

export function handleChangeSubcourtAlpha(call: ChangeSubcourtAlphaCall): void {
  log.info("handleChangeSubcourtAlpha: Updating alpha of court {}", [call.inputs._subcourtID.toString()])
  let court = getOrCreateCourt(call.inputs._subcourtID, call.to)
  court.alpha = call.inputs._alpha
  court.save()
}

export function handleChangeSubcourtJurorFee(call: ChangeSubcourtJurorFeeCall): void {
  log.info("handleChangeSubcourtJurorFee: Updating jurorfees of court {}", [call.inputs._subcourtID.toString()])
  let court = getOrCreateCourt(call.inputs._subcourtID, call.to)
  court.feeForJuror = call.inputs._feeForJuror
  court.save()
}

export function handleChangeSubcourtJurorsForJump(call: ChangeSubcourtJurorsForJumpCall): void {
  log.info("handleChangeSubcourtJurorsForJump: Updating jurorforJump of court {}", [call.inputs._subcourtID.toString()])
  let court = getOrCreateCourt(call.inputs._subcourtID, call.to)
  court.jurorsForCourtJump = call.inputs._jurorsForCourtJump
  court.save()
}

export function handleChangeSubcourtTimesPerPeriod(call: ChangeSubcourtTimesPerPeriodCall): void {
  log.info("handleChangeSubcourtTimesPerPeriod: Updating timesPerPeriod of court {}", [call.inputs._subcourtID.toString()])
  let court = getOrCreateCourt(call.inputs._subcourtID, call.to)
  court.timePeriods = call.inputs._timesPerPeriod
  court.save()
}

// Helper functions
function getPeriodString(period: number): string {
  log.debug("getPeriod function: Asking period of number {}", [period.toString()])
  if (period == 0) {
    return 'evidence'
  }
  else if (period == 1) {
    return 'commit'
  }
  else if (period == 2) {
    return 'vote'
  }
  else if (period == 3) {
    return 'appeal'
  }
  else if (period == 4) {
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

export function getOrInitializeKlerosCounter(): KlerosCounter {
  let kc = KlerosCounter.load('ID')
  if (kc == null) {
    log.debug("getOrInitializeKlerosCounter: Initializing counters", [])
    kc = new KlerosCounter('ID')
    kc.courtsCount = BigInt.fromI32(0);
    kc.disputesCount = BigInt.fromI32(0);
    kc.openDisputes = BigInt.fromI32(0);
    kc.closedDisputes = BigInt.fromI32(0);
    kc.evidencePhaseDisputes = BigInt.fromI32(0);
    kc.commitPhaseDisputes = BigInt.fromI32(0);
    kc.votingPhaseDisputes = BigInt.fromI32(0);
    kc.appealPhaseDisputes = BigInt.fromI32(0);
    kc.disputesAppealed = BigInt.fromI32(0);
    kc.appealPercentage = BigInt.fromI32(0);
    kc.activeJurors = BigInt.fromI32(0);
    kc.inactiveJurors = BigInt.fromI32(0);
    kc.drawnJurors = BigInt.fromI32(0);
    kc.numberOfArbitrables = BigInt.fromI32(0);
    kc.tokenStaked = BigInt.fromI32(0);
    kc.totalETHFees = BigInt.fromI32(0);
    kc.totalTokenRedistributed = BigInt.fromI32(0);
    kc.totalUSDthroughContract = BigInt.fromI32(0);
    kc.save()
  }
  return kc
}

export function getOrCreateCourt(subcourtID: BigInt, KLContract: Address): Court {
  let court = Court.load(subcourtID.toString())
  if (court == null) {
    court = new Court(subcourtID.toString())
    // log.debug("getOrCreateCourt: Creating court {}", [court.id])
    court.subcourtID = subcourtID
    court.childs = []
    court.disputesNum = BigInt.fromI32(0)
    court.disputesAppealed = BigInt.fromI32(0)
    court.appealPercentage = BigInt.fromI32(0)
    court.disputesClosed = BigInt.fromI32(0)
    court.disputesOngoing = BigInt.fromI32(0)
    court.activeJurors = BigInt.fromI32(0)
    court.tokenStaked = BigInt.fromI32(0)
    court.totalETHFees = BigInt.fromI32(0)
    court.totalTokenRedistributed = BigInt.fromI32(0)
    court.numberOfCoherentVotes = BigInt.fromI32(0)
    court.numberOfVotes = BigInt.fromI32(0)
    court.coherency = BigInt.fromI32(0);
    court.evidencePhaseDisputes = BigInt.fromI32(0);
    court.commitPhaseDisputes = BigInt.fromI32(0);
    court.votingPhaseDisputes = BigInt.fromI32(0);
    court.appealPhaseDisputes = BigInt.fromI32(0);
    let policy = PolicyUpdate.load(subcourtID.toString())
    if (policy == null) {
      court.policy = null
    } else {
      court.policy = policy.id
    }

    // get courtInputs from contract
    let contract = KlerosLiquid.bind(KLContract)
    let courtObj = contract.try_courts(subcourtID)
    if (!courtObj.reverted) {
      court.hiddenVotes = courtObj.value.value1
      court.minStake = courtObj.value.value2
      court.alpha = courtObj.value.value3
      court.feeForJuror = courtObj.value.value4
      court.jurorsForCourtJump = courtObj.value.value5
      // get timePeriods
      let subcourtObj = contract.getSubcourt(subcourtID)
      court.timePeriods = subcourtObj.value1
  
      let parentCourtID = courtObj.value.value0
      if (parentCourtID.notEqual(subcourtID)) {
        let parentCourt = getOrCreateCourt(parentCourtID, KLContract)
        court.parent = parentCourt.id
        // updating childs in parent court
        let childs = parentCourt.childs
        childs.push(court.id)
        parentCourt.childs = childs
        parentCourt.save()
      }
    } else {
      log.error("getOrCreateCourt: reverted call to SC. Setting values to 0 to avoid errors", []);
      court.hiddenVotes = false;
      court.minStake = BigInt.fromI32(0);
      court.alpha = BigInt.fromI32(1);
      court.feeForJuror = BigInt.fromI32(0);
      court.jurorsForCourtJump = BigInt.fromI32(0);
      court.timePeriods = [BigInt.fromI32(0), BigInt.fromI32(0), BigInt.fromI32(0), BigInt.fromI32(0)];
    }
    
    log.debug("getOrCreateCourt: Saving court", [])
    court.save()

    // update courtCounter
    let kc = getOrInitializeKlerosCounter()
    kc.courtsCount = kc.courtsCount.plus(BigInt.fromI32(1))
    kc.save()
  }
  return court
}

function getVoteId(dispute: BigInt, roundNum: BigInt, voteId: BigInt): string {
  return dispute.toString() + "-" + roundNum.toString() + "-" + voteId.toString()
}

function getRoundId(dispute:BigInt, round:BigInt): string {
  return dispute.toString() + "-" + round.toString()
}

function getLastRound(disputeID:BigInt):BigInt{
  // Iterate searching for the last round in this dispute
  let roundNum = BigInt.fromI32(0)
  let roundID = disputeID.toString() + "-" + roundNum.toString()
  let lastround = Round.load(roundID)
  if (lastround == null) { return BigInt.fromI32(0) }
  do {
    roundNum = roundNum.plus(BigInt.fromI32(1))
    roundID = disputeID.toString() + "-" + roundNum.toString()
    //log.debug("getLastRound: searching for roundID {}",[roundID])
    lastround = Round.load(roundID)
  }
  while (lastround != null);
  // the last round searched doesn't exist, so I've to return the last one??
  return roundNum.minus(BigInt.fromI32(1))
}

function getCourtStakeId(address: Address, courtID: BigInt): string {
  return address.toHexString() + "-" + courtID.toString();
}

function createOrUpdateCourtStake(courtID: BigInt, stake: BigInt, address: Address, timestamp: BigInt,
  blockNumber: BigInt, txID: Bytes, KLContract: Address): CourtStake {
  let id = getCourtStakeId(address, courtID)
  let courtStake = CourtStake.load(id)

  if (courtStake == null) {
    log.debug("createOrUpdateCourtStake: Creating a new CourtStake in the court {} for juror {}", [courtID.toString(), address.toHexString()])
    courtStake = new CourtStake(id)

    let court = getOrCreateCourt(courtID, KLContract)
    courtStake.court = court.id
    let juror = getOrCreateJuror(address, courtID, BigInt.fromI32(0), KLContract)
    courtStake.juror = juror.id
  }

  courtStake.stake = stake
  courtStake.timestamp = timestamp
  courtStake.blockNumber = blockNumber
  courtStake.txid = txID

  courtStake.save()

  return courtStake
}

function getOrCreateJuror(address: Address, courtID: BigInt | null, totalStake: BigInt, KLContract: Address): Juror {
  let id = address.toHexString()
  let juror = Juror.load(id)
  if (juror == null) {
    log.debug("getOrCreateJuror: Creating a new juror with address {}", [id])
    juror = new Juror(id)
    juror.numberOfDisputesCreated = BigInt.fromI32(0)
    juror.numberOfDisputesAsJuror = BigInt.fromI32(0)
    juror.totalStaked = totalStake
    juror.ethRewards = BigInt.fromI32(0)
    juror.tokenRewards = BigInt.fromI32(0)
    juror.coherency = BigInt.fromI32(0)
    juror.numberOfCoherentVotes = BigInt.fromI32(0)
    juror.numberOfVotes = BigInt.fromI32(0)
    if (courtID !== null){
      let court = getOrCreateCourt(courtID, KLContract)
      juror.subcourtsIDs = [court.id]
    } else {
      juror.subcourtsIDs = []
    }
    juror.totalGasCost = BigInt.fromI32(0)
    juror.save()
  }
  return juror
}

function updateJurorStake(address: Address, courtID: BigInt, stake: BigInt, totalStaked: BigInt,
  timestamp: BigInt, blockNumber: BigInt, txID: Bytes,
  jurorStatus: number, KLContract: Address): void {
  log.debug("updateJurorStake: updating court stake for juror {} and court {}", [address.toHexString(), courtID.toString()])

  let juror = getOrCreateJuror(address, courtID, totalStaked, KLContract)
  let court = getOrCreateCourt(courtID, KLContract)

  let oldStake = getCourtStakeValue(courtID, address)

  if (
    (oldStake.equals(BigInt.fromI32(0)) && totalStaked.equals(BigInt.fromI32(0)))
    || (stake.equals(BigInt.fromI32(0)) && !isActiveInThisCourt(courtID, address))
  ) {
    // nothing to do
    return
  }

  createOrUpdateCourtStake(courtID, stake, address, timestamp, blockNumber, txID, KLContract)

  // update KlerosCounters 
  updateKCDueToStake(oldStake, stake, jurorStatus)
  // update court stats for jurors and token staked
  updateCourtDueToStake(address, courtID, false, oldStake, stake, jurorStatus, KLContract)

  // update juror entity
  juror.totalStaked = totalStaked
  let subcourtIDs = juror.subcourtsIDs
  if (subcourtIDs !== null && subcourtIDs.indexOf(court.id) === -1) {
    subcourtIDs.push(court.id)
  } else {
    juror.subcourtsIDs = subcourtIDs
  }
  juror.save()
}

function updateCourtDueToStake(jurorAddress: Address, courtID: BigInt | null, updatingParent: boolean, oldStake: BigInt, newStake: BigInt, jurorStatus: number, KLContract: Address): void {
  if (courtID === null) return;
  let court = getOrCreateCourt(courtID, KLContract)

  if (jurorStatus < 1) {
    if (
      // if the juror is unstaking from this court and he's not staked in a sub court...
      (!updatingParent && !isActiveInSubCourt(jurorAddress, courtID, KLContract, false))
      // or if we are updating a parent court and the juror is not already staked in the parent court or any subcourt...
      || (updatingParent && !isActiveInThisCourt(courtID, jurorAddress) && !isActiveInSubCourt(jurorAddress, courtID, KLContract, false))
    ) {
      log.debug("updateCourtTokenStaked: Removing the juror from court {}. OldStake {}, NewStake {}", [court.id, oldStake.toString(), newStake.toString()])
      court.activeJurors = court.activeJurors.minus(BigInt.fromI32(1))
    } else {
      log.debug("updateCourtTokenStaked: Juror unstaking from child court but still staked in parent court {}. OldStake {}, NewStake {}", [court.id, oldStake.toString(), newStake.toString()])
    }
  } else if (jurorStatus > 1) {
    if (
      // if the juror is staking in this court and he's not already staked in a sub court...
      (!updatingParent && !isActiveInSubCourt(jurorAddress, courtID, KLContract, false))
      // or if we are updating a parent court and the juror is not already staked in the parent court and is only staked in one subcourt (the subcourt that triggers the parent update)...
      || (updatingParent && !isActiveInThisCourt(courtID, jurorAddress)) && isActiveInSubCourt(jurorAddress, courtID, KLContract, true)) {
      log.debug("updateCourtTokenStaked: Adding the new juror to court {}. OldStake {}, NewStake {}", [court.id, oldStake.toString(), newStake.toString()])
      court.activeJurors = court.activeJurors.plus(BigInt.fromI32(1))
    } else {
      log.debug("updateCourtTokenStaked: The juror already exist in court {}. OldStake {}, NewStake {}", [court.id, oldStake.toString(), newStake.toString()])
    }

    if (oldStake.notEqual(BigInt.fromI32(0))) {
      log.error("updateCourtTokenStaked: oldStake should be zero for a new juror or old inactive juror staking again!. OldStake {}, NewStake {}", [court.id, oldStake.toString(), newStake.toString()])
      oldStake = BigInt.fromI32(0)
    }
  } else {
    log.debug("updateCourtTokenStaked: Just changes in the tokenStaked for court {}. OldStake {}, NewStake {}", [court.id, oldStake.toString(), newStake.toString()])
  }
  court.tokenStaked = court.tokenStaked.minus(oldStake).plus(newStake)
  court.save()

  // if this court has a parent, update the tokenStaked and counters in the parent court too.
  if (court.parent !== null) {
    updateCourtDueToStake(jurorAddress, BigInt.fromString(court.parent!), true, oldStake, newStake, jurorStatus, KLContract)
  }
}

function checkJurorStatus(address: Address, stake: BigInt, newTotalStaked: BigInt, court: BigInt): number {
  // -1 = quitting from all the courts
  // 0 = quitting just from this court (but still active in other courts)
  // 1 = changing stake in this court, still an active juror (or inactive juror)
  // 2 = old inactive juror staking again in a court
  // 3 = active juror staking for the first time in a this court
  // 4 = very first time juror.
  let juror = Juror.load(address.toHexString())
  let isActive = isActiveInThisCourt(court, address)

  if (juror == null) {
    // This juror doesn't exist, it's a new juror staking
    log.debug("checkJurorStatus: Say hi to {} who is a new juror", [address.toHexString()])
    return 4
  }
  // the juror exist
  let isActiveGlobally = juror.totalStaked.gt(BigInt.fromI32(0)) // BEfore this stake it's stored.
  if (isActive) {
    if (stake.gt(BigInt.fromI32(0)) && newTotalStaked.gt(BigInt.fromI32(0))) {
      // active juror in this court changing it's stake in this court.
      log.debug("checkJurorStatus: {} is an active juror changing his stake in the court!. Total Staked {}, stake {}", [address.toHexString(), juror.totalStaked.toString(), stake.toString()])
      return 1
    } else if (stake.equals(BigInt.fromI32(0)) && newTotalStaked.gt(BigInt.fromI32(0))) {
      // active juror of this court, leaving just this court

      return 0
    } else if (stake.equals(BigInt.fromI32(0)) && newTotalStaked.equals(BigInt.fromI32(0))) {
      // active juror leaving all the courts
      log.debug("checkJurorStatus: {} is an active juror quitting from all the courts!. old Total Staked {}, new Total Staked {}, stake {}", [address.toHexString(), juror.totalStaked.toString(), newTotalStaked.toString(), stake.toString()])
      return -1
    } else {
      log.error("checkJurorStatus: Reaching an imposible condition¿?. stake = {}, newTotalStaked = {}", [
        stake.toString(), newTotalStaked.toString()])
    }
  } else {
    // not an active juror in this court.
    if (isActiveGlobally) {
      // Active juror in other court, but not in this court.
      if (stake.gt(BigInt.fromI32(0))) {
        // this juror is staking for the first time in this court.
        log.debug("checkJurorStatus: {} is an active juror but first time in this court!. Total Staked {}, stake {}", [address.toHexString(), juror.totalStaked.toString(), stake.toString()])
        return 3
      } else {
        log.warning("checkJurorStatus: {} is a active in another court, but not in this court. Is staking 0? Returning 1. Total Staked {}, stake {}", [address.toHexString(), juror.totalStaked.toString(), stake.toString()])
        return 1
      }
    } else {
      if (stake.gt(BigInt.fromI32(0))) {
        // inactive juror staking
        log.debug("checkJurorStatus: Hey, {} is a juror returning to the courts!. old Total Staked {}, new Total Staked {}, stake {}", [address.toHexString(), juror.totalStaked.toString(), newTotalStaked.toString(), stake.toString()])
        return 2
      } else {
        // inactive juror unstaking (double txs?)
        log.debug("checkJurorStatus: Mmmm, this is an inactive juror staking 0? The juror {} is sending the tx twice?. Returning status as 1 (not change active/inactive jurors", [juror.id])
        return 1
      }
    }
  }
  log.error("checkJurorStatus: Mmmm, This should never be met, what's doing the juror {} with stake {}?. TotalStaked {}. Returning 1", [juror.id, stake.toString(), juror.totalStaked.toString()])
  return 1
}

function getCourtStakeValue(court: BigInt, address: Address): BigInt {
  let courtStake = CourtStake.load(getCourtStakeId(address, court))

  if (courtStake == null) {
    return BigInt.fromI32(0)
  }

  return courtStake.stake
}

function isActiveInThisCourt(court: BigInt, address: Address): boolean {
  return getCourtStakeValue(court, address).gt(BigInt.fromI32(0))
}

function getCourtTree(courtID: BigInt, KLContract: Address): BigInt[] {
  let court = getOrCreateCourt(courtID, KLContract)
  let subCourts = court.childs

  let tree: BigInt[] = [courtID]

  for (let i = 0; i < subCourts.length; i++) {
    tree = tree.concat(getCourtTree(BigInt.fromString(subCourts[i]), KLContract))
  }

  return tree
}

function isActiveInSubCourt(jurorAddress: Address, courtID: BigInt, KLContract: Address, onlyOneSubCourt: boolean): boolean {
  let activeCount = 0

  let courtTree = getCourtTree(courtID, KLContract)

  for (let i = 0; i < courtTree.length; i++) {
    if (courtID.notEqual(courtTree[i])) {
      let courtStake = CourtStake.load(getCourtStakeId(jurorAddress, courtTree[i]))

      if (courtStake !== null && courtStake.stake.gt(BigInt.fromI32(0))) {
        activeCount++
      }
    }
  }

  return onlyOneSubCourt ? activeCount === 1 : activeCount > 0
}

function updateKCDueToStake(oldStake: BigInt, newStake: BigInt, jurorStatus: number): void {
  // update global counters for tokenStaked and active jurors
  let kc = getOrInitializeKlerosCounter()
  if (jurorStatus === 4) {
    // newJuror
    log.debug("updateKCDueToStake: updating KC with a new Juror!. OldStake {} and NewStake {}", [oldStake.toString(), newStake.toString()])
    kc.activeJurors = kc.activeJurors.plus(BigInt.fromI32(1))
    if (oldStake.notEqual(BigInt.fromI32(0))) {
      log.warning("updateKCDueToStake: it's a new juror, oldStake should be zero. OldStake {} and NewStake {}", [oldStake.toString(), newStake.toString()])
      oldStake = BigInt.fromI32(0)
    }
  } else if (jurorStatus === 3) {
    log.debug("updateKCDueToStake: KC juror counts doesn't need to be changed, just the tokenStaked, This juror is an active juror staking for the first time in a court. Stake {} to {}", [oldStake.toString(), newStake.toString()])
    if (oldStake.notEqual(BigInt.fromI32(0))) {
      log.warning("updateKCDueToStake: it's their first time in a court, oldStake should be zero. OldStake {} and NewStake {}", [oldStake.toString(), newStake.toString()])
      oldStake = BigInt.fromI32(0)
    }
  } else if (jurorStatus === 2) {
    // old juror staking again
    log.debug("updateKCDueToStake: updating KC with an old inactive juror now as active!. OldStake {} and NewStake {}", [oldStake.toString(), newStake.toString()])
    kc.activeJurors = kc.activeJurors.plus(BigInt.fromI32(1))
    kc.inactiveJurors = kc.inactiveJurors.minus(BigInt.fromI32(1))
    if (oldStake.notEqual(BigInt.fromI32(0))) {
      log.warning("updateKCDueToStake: it's an old inactive juror, oldStake should be zero. OldStake {} and NewStake {}", [oldStake.toString(), newStake.toString()])
      oldStake = BigInt.fromI32(0)
    }
  } else if (jurorStatus === 1) {
    log.debug("updateKCDueToStake: KC juror counts doesn't need to be changed, just the tokenStaked, This juror is just changing their stake from {} to {}", [oldStake.toString(), newStake.toString()])
  } else if (jurorStatus === 0) {
    log.debug("updateKCDueToStake: KC juror counts doesn't need to be changed, just the tokenStaked, This juror is just quitting from one court. Stake from {} to {}", [oldStake.toString(), newStake.toString()])
  } else if (jurorStatus === -1) {
    // An active juror quiting from all the courts
    kc.activeJurors = kc.activeJurors.minus(BigInt.fromI32(1))
    kc.inactiveJurors = kc.inactiveJurors.plus(BigInt.fromI32(1))
    log.debug("updateKCDueToStake: updating KC with an active juror quitting from all the courts. OldStake {} and NewStake {}", [oldStake.toString(), newStake.toString()])
  }
  kc.tokenStaked = kc.tokenStaked.plus(newStake).minus(oldStake)
  kc.save()
}

function getOrCreateArbitrable(address: Address): Arbitrable {
  let id = address.toHexString()
  let arbitrable = Arbitrable.load(id)
  if (arbitrable == null) {
    log.debug("getOrCreateArbitrable: Creating a new arbitrable with address {}", [id])
    arbitrable = new Arbitrable(id)
    arbitrable.ethFees = BigInt.fromI32(0)
    arbitrable.disputesCount = BigInt.fromI32(0)
    arbitrable.openDisputes = BigInt.fromI32(0)
    arbitrable.closedDisputes = BigInt.fromI32(0)
    arbitrable.evidencePhaseDisputes = BigInt.fromI32(0)
    arbitrable.commitPhaseDisputes = BigInt.fromI32(0)
    arbitrable.votingPhaseDisputes = BigInt.fromI32(0)
    arbitrable.appealPhaseDisputes = BigInt.fromI32(0)
    arbitrable.save()

    // add 1 to the arbitrables count
    let kc = getOrInitializeKlerosCounter()
    kc.numberOfArbitrables = kc.numberOfArbitrables.plus(BigInt.fromI32(1))
    kc.save()
  }
  return arbitrable
}