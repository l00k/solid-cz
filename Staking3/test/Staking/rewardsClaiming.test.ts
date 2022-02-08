import { ExtERC20 } from '@/ExtERC20';
import { RewardsClaimedEvent, Staking, TransferEvent } from '@/Staking';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers, network } from 'hardhat';
import colors from 'colors';
import { Factory } from '../fixtures/contracts';
import { createTokens } from '../fixtures/tokens';
import {
    assertErrorMessage,
    findEvent,
    getSigners,
    mineBlock,
    Signers,
    tokenFormat,
    waitForTxs
} from '../helpers/utils';



type Pool = {
    tokenIdx: number,
    amount: BigNumber,
    timespan: number,
    rewardsPerSecond: BigNumber,
};

type Staker = {
    account: SignerWithAddress,
    stake: BigNumber,
    rewards: BigNumber[],
};

type Stakers = {
    alice: Staker,
    bob: Staker,
    carol: Staker,
    dave: Staker,
};



xdescribe('Staking / Rewards claiming', async() => {
    let accounts : Partial<Signers> = {};
    
    let tokenMain : ExtERC20;
    let tokenRewards : { [i : number] : ExtERC20 } = {};
    
    let stakingContract : Staking;
    let rewardPools : { [i : number] : any } = {};
    
    let pools : Pool[] = [];
    
    let stakers : Partial<Stakers> = {};
    
    
    async function stakeTokens(stakes : { [ stakerName : string ]: BigNumber })
    {
        const txs = [];
    
        for (const [ stakerName, amount ] of Object.entries<BigNumber>(stakes)) {
            const staker = stakers[stakerName];
            
            const tx = await stakingContract
                .connect(staker.account)
                .stake(amount);
            txs.push(tx);
            
            // local info
            staker.stake = staker.stake.add(amount);
        }
        
        return txs;
    }
    
    async function checkStakers(...stakerNames: string[])
    {
        for (const stakerName of stakerNames) {
            const staker = stakers[stakerName];
        
            const stake = await stakingContract.balanceOf(staker.account.address);
            expect(stake).to.be.equal(staker.stake);
        
            const rewards = await stakingContract.rewardsOf(staker.account.address);
            for (let p = 0; p < 3; ++p) {
                expect(rewards[p].balance).to.be.equal(staker.rewards[p]);
            }
        }
    }
    
    async function checkShares(shares : { [ stakerName : string ]: number })
    {
        const totalShare = await stakingContract.totalShares();
        
        for (const [ stakerName, shareRatio ] of Object.entries<number>(shares)) {
            const staker = stakers[stakerName];
            const stakerShare = await stakingContract.stakerShare(staker.account.address)
        
            expect(
                stakerShare.mul(1000000).div(totalShare).toNumber() / 1000000
            ).to.be.equal(shareRatio);
        }
    }
    
    function addLocalRewards(ratios : { [ stakerName : string ]: number }, time : number|number[])
    {
        for (const [ stakerName, ratio ] of Object.entries<number>(ratios)) {
            const staker = stakers[stakerName];
            
            for (let p = 0; p < 3; ++p) {
                const poolTime = time instanceof Array
                    ? time[p]
                    : time;
            
                staker.rewards[p] = staker.rewards[p].add(
                    pools[p].rewardsPerSecond
                        .mul(poolTime)
                        .mul(100000000000 * ratio)
                        .div(100000000000)
                );
            }
        }
    }
    
    async function displayDetails(label : string = 'details')
    {
        const totalShares = await stakingContract.totalShares();
        const block = await ethers.provider.getBlock('latest');
        
        console.log(
            colors.red('### ' + label),
        );
        
        for (const [name, account] of Object.entries(accounts)) {
            
            const stake = await stakingContract.balanceOf(account.address);
            if (Number(stake.toString()) == 0) {
                continue;
            }
            
            console.log(colors.green(name));
            console.log("\tStake", stake.div(tokenFormat(1, 18)).toNumber());
            
            const rewards = await stakingContract.rewardsOf(account.address);
            console.log("\tRewards");
            console.log("\t\t0", rewards[0].balance.div(tokenFormat(1, 18)).toNumber());
            console.log("\t\t1", rewards[1].balance.div(tokenFormat(1, 18)).toNumber());
            console.log("\t\t2", rewards[2].balance.div(tokenFormat(1, 8)).toNumber());
            
            const share = await stakingContract.stakerShare(account.address);
            console.log(
                "\tShare",
                share.div(tokenFormat(1, 6)).toNumber(),
                (Number(share.toString()) / Number(totalShares.toString()) * 100).toFixed(1) + '%'
            );
        }
        
        console.log();
    }
    
    
    /**
     * BEFORE ALL
     */
    beforeEach(async() => {
        accounts = await getSigners();
        
        [
            tokenMain,
            tokenRewards[0],
            tokenRewards[1],
            tokenRewards[2]
        ] = await createTokens('staking', 'reward1', 'reward2', 'reward3');
        
        stakingContract = await Factory.Staking(tokenMain.address);
        
        // approves
        for (const account of Object.values(accounts)) {
            const tx = await tokenMain.connect(account).approve(
                stakingContract.address,
                tokenFormat(10000000)
            );
            await tx.wait();
        }
        
        // pools
        pools = [
            {
                tokenIdx: 0,
                amount: tokenFormat(1000000),
                timespan: 10000,
                // internal values
                rewardsPerSecond: tokenFormat(100)
            },
            {
                tokenIdx: 1,
                amount: tokenFormat(5000000),
                timespan: 20000,
                // internal values
                rewardsPerSecond: tokenFormat(250)
            },
            {
                tokenIdx: 2,
                amount: tokenFormat(50000, 8),
                timespan: 1000,
                // internal values
                rewardsPerSecond: tokenFormat(50, 8)
            },
        ];
        
        for (const pool of pools) {
            const token = tokenRewards[pool.tokenIdx];
            
            // approve reward token
            const approveTx = await token.connect(accounts.owner).approve(
                stakingContract.address,
                pool.amount
            );
            await approveTx.wait();
            
            // create pool
            const poolCreateTx = await stakingContract.connect(accounts.owner).createRewardsPool(
                token.address,
                pool.amount,
                pool.timespan
            );
            await poolCreateTx.wait();
        }
        
        // stakers
        stakers = <any> {};
        for (const name of [ 'alice', 'bob', 'carol', 'dave' ]) {
            stakers[name] = {
                account: accounts[name],
                stake: tokenFormat(0),
                rewards: [ tokenFormat(0), tokenFormat(0), tokenFormat(0) ],
            };
        };
    });
    
    afterEach(async() => {
        await network.provider.send('evm_setAutomine', [ true ]);
    });
    
    
    it('Validates pool id', async() => {
        const tx = stakingContract.connect(accounts.alice).claimRewards(5);
        await assertErrorMessage(tx, 'InvalidPool()');
    });
    
    
    it('Properly transfer tokens while claiming', async() => {
        await network.provider.send('evm_setAutomine', [ false ]);
        
        // Inital staking (25%, 25%, 50%)
        {
            const txs = await stakeTokens({
                alice: tokenFormat(10000),
                bob: tokenFormat(10000),
                carol: tokenFormat(20000),
            });
            await mineBlock();
            await waitForTxs(txs);
        }
        
        // Alice claims rewards
        {
            const preContractBalances = [];
            const preAliceBalances = [];
            
            for (let t = 0; t < 3; ++t) {
                preContractBalances.push(await tokenRewards[t].balanceOf(stakingContract.address));
                preAliceBalances.push(await tokenRewards[t].balanceOf(accounts.alice.address));
            }
            
            // adjust local rewards state
            addLocalRewards({
                alice: 0.25,
                bob: 0.25,
                carol: 0.5
            }, 100);
        
            // claim rewards
            const tx = await stakingContract.connect(accounts.alice).claimAllRewards();
            await mineBlock(100);
            const result = await tx.wait();
            
            // check events
            for (let t = 0; t < 3; ++t) {
                const eventClaim = findEvent<RewardsClaimedEvent>(result, 'RewardsClaimed', t);
                expect(eventClaim.args.amount).to.be.equal(stakers.alice.rewards[t]);
            
                const eventTransfer = findEvent<TransferEvent>(result, 'Transfer', t);
                expect(eventTransfer.args.from).to.be.equal(stakingContract.address);
                expect(eventTransfer.args.to).to.be.equal(accounts.alice.address);
                expect(eventTransfer.args.value).to.be.equal(stakers.alice.rewards[t]);
            }
            
            // check balances
            for (let t = 0; t < 3; ++t) {
                const postContractBalance = await tokenRewards[t].balanceOf(stakingContract.address);
                const deltaContractBalance = preContractBalances[t].sub(postContractBalance);
                expect(deltaContractBalance).to.be.equal(stakers.alice.rewards[t]);
                
                const postAliceBalance = await tokenRewards[t].balanceOf(accounts.alice.address);
                const deltaAliceBalance = postAliceBalance.sub(preAliceBalances[t]);
                expect(deltaContractBalance).to.be.equal(stakers.alice.rewards[t]);
            }
        }
    });
    
    
    it('Properly updates share factor after single rewards claiming', async() => {
        await network.provider.send('evm_setAutomine', [ false ]);
        
        // Inital staking (25%, 25%, 50%)
        {
            const txs = await stakeTokens({
                alice: tokenFormat(10000),
                bob: tokenFormat(10000),
                carol: tokenFormat(20000),
            });
            await mineBlock();
            await waitForTxs(txs);
        }
        
        // Mine next block (50 seconds later)
        {
            await mineBlock(50);
            
            addLocalRewards({
                alice: 0.25,
                bob: 0.25,
                carol: 0.5
            }, 50);
            
            await checkShares({
                alice: 0.25,
                bob: 0.25,
                carol: 0.5
            });
        }
        
        // Alice claims rewards
        {
            const tx = await stakingContract.connect(accounts.alice).claimRewards(0);
            await mineBlock(110);
            const result = await tx.wait();
            
            expect(result.status).to.be.equal(1);
            
            // adjust local rewards state
            addLocalRewards({
                alice: 0.25,
                bob: 0.25,
                carol: 0.5
            }, 110);
            
            stakers.alice.rewards[0] = BigNumber.from(0);
            
            // After Alice claimed rewards share ratio is:
            // Alice: 22.0%
            // Bob:   26.0%
            // Carol: 52.0%
            
            await checkShares({
                alice: 0.22,
                bob: 0.26,
                carol: 0.52
            });
        }
        
        // Mine next block (100 seconds later)
        {
            await mineBlock(100);
            
            addLocalRewards({
                alice: 0.22,
                bob: 0.26,
                carol: 0.52
            }, 100);
            
            await checkShares({
                alice: 0.22,
                bob: 0.26,
                carol: 0.52
            });
            await checkStakers('alice', 'bob', 'carol');
        }
    });
    
    
    it('Properly updates share factor after all rewards claiming', async() => {
        await network.provider.send('evm_setAutomine', [ false ]);
        
        // Inital staking (25%, 25%, 50%)
        {
            const txs = await stakeTokens({
                alice: tokenFormat(10000),
                bob: tokenFormat(10000),
                carol: tokenFormat(20000),
            });
            await mineBlock();
            await waitForTxs(txs);
        }
        
        // Mine next block (50 seconds later)
        {
            await mineBlock(50);
            
            addLocalRewards({
                alice: 0.25,
                bob: 0.25,
                carol: 0.5
            }, 50);
            
            await checkShares({
                alice: 0.25,
                bob: 0.25,
                carol: 0.5
            });
        }
        
        // Alice claims rewards
        {
            const tx = await stakingContract.connect(accounts.alice).claimAllRewards();
            await mineBlock(150);
            const result = await tx.wait();
            
            expect(result.status).to.be.equal(1);
            
            // adjust local rewards state
            addLocalRewards({
                alice: 0.25,
                bob: 0.25,
                carol: 0.5
            }, 150);
            
            // reflect claiming rewards
            stakers.alice.rewards[0] = BigNumber.from(0);
            stakers.alice.rewards[1] = BigNumber.from(0);
            stakers.alice.rewards[2] = BigNumber.from(0);
            
            // After Alice claimed rewards share ratio is:
            // Alice: 10.0%
            // Bob:   30.0%
            // Carol: 60.0%
            
            await checkShares({
                alice: 0.1,
                bob: 0.3,
                carol: 0.6
            });
        }
        
        // Mine next block (100 seconds later)
        {
            await mineBlock(100);
            
            addLocalRewards({
                alice: 0.1,
                bob: 0.3,
                carol: 0.6
            }, 100);
            
            await checkShares({
                alice: 0.1,
                bob: 0.3,
                carol: 0.6
            });
            await checkStakers('alice', 'bob', 'carol');
        }
    });
});
