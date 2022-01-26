import { Coin } from '@/Coin';
import { RewardPoolCreatedEvent, Staking, TokenStakedEvent } from '@/Staking';
import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers, network } from 'hardhat';
import { findEvent } from '../../SampleCoin/test/helpers/utils';
import { Factory } from './fixtures/contracts';
import { initialErc20Transfers } from './fixtures/initial-transfers';
import { assertErrorMessage } from './helpers/utils';


function tokenFormat (amount : BigNumberish, decimals : number = 18) : BigNumber
{
    return BigNumber.from(amount).mul(BigNumber.from(10).pow(decimals));
}

const tokens = {
    staking: {
        name: '4soft Defi Training',
        symbol: 'DST',
        initialSupply: tokenFormat(1000000000),
        decimals: 18,
    },
    reward1: {
        name: '4soft Defi Reward 1',
        symbol: 'DR1',
        initialSupply: tokenFormat(1000000000),
        decimals: 18,
    },
    reward2: {
        name: '4soft Defi Reward 2',
        symbol: 'DR2',
        initialSupply: tokenFormat(1000000000),
        decimals: 18,
    },
    reward3: {
        name: '4soft Defi Reward 3',
        symbol: 'DR3',
        initialSupply: tokenFormat(1000000000, 8),
        decimals: 8,
    },
};

const day = 24 * 3600;
const month = 30 * day;


describe('Staking contract', async() => {
    
    describe('Creating rewards pool', async() => {
        let creator, alice, bob, john, jane;
        let tokenMain : Coin;
        let tokenReward : Coin;
        let stakingContract : Staking;
        
        beforeEach(async() => {
            [ creator, alice, bob, john, jane ] = await ethers.getSigners();
            
            // create stake token
            tokenMain = <any>await Factory.Coin(
                tokens.staking.name,
                tokens.staking.symbol,
                tokens.staking.initialSupply,
                tokens.staking.decimals
            );
            await initialErc20Transfers(
                tokenMain,
                tokenFormat(100000)
            );
            
            // create rewards tokens
            tokenReward = <any>await Factory.Coin(
                tokens.reward1.name,
                tokens.reward1.symbol,
                tokens.reward1.initialSupply,
                tokens.reward1.decimals
            );
            await initialErc20Transfers(
                tokenReward,
                tokenFormat(100000)
            );
            
            // create staking contract
            stakingContract = <any>await Factory.Staking(tokenMain.address);
        });
        
        it('Properly validate arguments', async() => {
            {
                const tx = stakingContract.connect(creator).createRewardsPool(tokenReward.address, 0, month);
                assertErrorMessage(tx, 'WrongAmount()');
            }
            
            {
                const tx = stakingContract.connect(creator).createRewardsPool(tokenReward.address, 1000, 0);
                assertErrorMessage(tx, 'WrongTimespan()');
            }
        });
        
        it('Allow creating rewards pool only by owner', async() => {
            // try to create by non owner
            {
                const tx = await tokenReward.connect(alice).approve(
                    stakingContract.address,
                    tokenFormat(10000)
                );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            {
                const tx = stakingContract.connect(alice).createRewardsPool(
                    tokenReward.address,
                    tokenFormat(10000),
                    month
                );
                assertErrorMessage(tx, 'Ownable: caller is not the owner');
            }
            
            // create by owner
            {
                const tx = await tokenReward.connect(creator).approve(
                    stakingContract.address,
                    tokenFormat(10000)
                );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            {
                const tx = await stakingContract.connect(creator).createRewardsPool(
                    tokenReward.address,
                    tokenFormat(10000),
                    month
                );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
        });
        
        it('Require sufficient amount of allowed tokens', async() => {
            // first deposit tokens to contract
            {
                const tx = await tokenReward.connect(creator).approve(
                    stakingContract.address,
                    tokenFormat(1000)
                );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // create by owner without sufficient amount
            {
                const tx = stakingContract.connect(creator).createRewardsPool(
                    tokenReward.address,
                    tokenFormat(10000),
                    month
                );
                assertErrorMessage(tx, `InsufficientBalance(${tokenFormat(10000)}, ${tokenFormat(1000)})`);
            }
            
            // approve more tokens to contract
            {
                const tx = await tokenReward.connect(creator).approve(
                    stakingContract.address,
                    tokenFormat(10000)
                );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // create by owner with require amount
            {
                const balanceBefore = await tokenReward.balanceOf(creator.address);
                
                const tx = await stakingContract.connect(creator).createRewardsPool(
                    tokenReward.address,
                    tokenFormat(10000),
                    month
                );
                const result = await tx.wait();
                
                expect(result.status).to.be.equal(1);
                
                const event = findEvent<RewardPoolCreatedEvent>(result, 'RewardPoolCreated');
                expect(event.args.rewardToken).to.be.equal(tokenReward.address);
                expect(event.args.amount).to.be.equal(tokenFormat(10000));
                expect(event.args.timespan).to.be.equal(month);
                
                const balanceAfter = await tokenReward.balanceOf(creator.address);
                const delta = balanceBefore.sub(balanceAfter);
                expect(delta).to.be.equal(tokenFormat(10000));
            }
        });
    });
    
    
    describe('Staking', async() => {
        let creator, alice, bob, john, jane;
        let tokenMain : Coin;
        let tokenRewards : { [i : number] : Coin } = {};
        let stakingContract : Staking;
        
        beforeEach(async() => {
            [ creator, alice, bob, john, jane ] = await ethers.getSigners();
            
            // create stake token
            tokenMain = <any>await Factory.Coin(
                tokens.staking.name,
                tokens.staking.symbol,
                tokens.staking.initialSupply,
                tokens.staking.decimals
            );
            await initialErc20Transfers(
                tokenMain,
                tokenFormat(100000)
            );
            
            // create rewards tokens
            for (let i = 0; i < 3; ++i) {
                const tokenDesc = tokens['reward' + (i + 1)];
                
                tokenRewards[i] = <any>await Factory.Coin(
                    tokenDesc.name,
                    tokenDesc.symbol,
                    tokenDesc.initialSupply,
                    tokenDesc.decimals
                );
                
                await initialErc20Transfers(
                    tokenRewards[i],
                    tokenFormat(100000, tokenDesc.decimals)
                );
            }
            
            
            // create staking contract
            stakingContract = <any>await Factory.Staking(tokenMain.address);
            
            // create reward pools
            const pools = [
                { tokenIdx: 0, amount: tokenFormat(1000000), timespan: 30 * day },
                { tokenIdx: 1, amount: tokenFormat(5000000), timespan: 20 * day },
                { tokenIdx: 2, amount: tokenFormat(50000, 8), timespan: 60 * day },
            ];
            
            for (const pool of pools) {
                const token = tokenRewards[pool.tokenIdx];
                
                // approve coins
                {
                    const tx = await token.connect(creator).approve(
                        stakingContract.address,
                        pool.amount
                    );
                    const result = await tx.wait();
                    expect(result.status).to.be.equal(1);
                }
                
                // create pool
                {
                    const tx = await stakingContract.connect(creator).createRewardsPool(
                        token.address,
                        pool.amount,
                        month
                    );
                    const result = await tx.wait();
                    expect(result.status).to.be.equal(1);
                }
            }
        });
        
        it('Properly validate arguments', async() => {
            {
                const tx = stakingContract.connect(creator).stake(0);
                assertErrorMessage(tx, 'WrongAmount()');
            }
        });
        
        it('Require sufficient amount of allowed tokens', async() => {
            {
                const tx = await tokenMain.connect(alice).approve(
                    stakingContract.address,
                    tokenFormat(1000)
                );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            {
                const tx = stakingContract.connect(alice).stake(tokenFormat(1001));
                assertErrorMessage(tx, `InsufficientBalance(${tokenFormat(1001)}, ${tokenFormat(1000)})`);
            }
            
            {
                const balanceBefore = await tokenMain.balanceOf(alice.address);
                
                const tx = await stakingContract.connect(alice).stake(tokenFormat(1000));
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                const event = findEvent<TokenStakedEvent>(result, 'TokenStaked');
                expect(event.args.amount).to.be.equal(tokenFormat(1000));
                
                const balanceAfter = await tokenMain.balanceOf(alice.address);
                const delta = balanceBefore.sub(balanceAfter);
                expect(delta).to.be.equal(tokenFormat(1000));
            }
        });
        
        it('Returns proper state informations', async() => {
            // state before any action
            {
                const stake = await stakingContract.balanceOf(alice.address);
                expect(stake).to.be.equal(0);
                
                const rewards = await stakingContract.rewardsOf(alice.address);
                for (let i = 0; i < 3; ++i) {
                    expect(rewards[i].token).to.be.equal(tokenRewards[i].address);
                    expect(rewards[i].balance).to.be.equal(0);
                }
            }
            
            // approve
            {
                const tx = await tokenMain.connect(alice).approve(
                    stakingContract.address,
                    tokenFormat(10000)
                );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // stake
            let timestamp = Math.round(Date.now() / 1000);
            await network.provider.send('evm_setNextBlockTimestamp', [ timestamp ]);
            
            {
                const tx = await stakingContract.connect(alice).stake(tokenFormat(1000));
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // check state
            {
                const stake = await stakingContract.balanceOf(alice.address);
                expect(stake).to.be.equal(tokenFormat(1000));
                
                const rewards = await stakingContract.rewardsOf(alice.address);
                for (let i = 0; i < 3; ++i) {
                    expect(rewards[i].balance).to.be.equal(0);
                }
            }
            
            // next stake (1h later)
            timestamp += 3600;
            await network.provider.send('evm_setNextBlockTimestamp', [ timestamp ]);
            
            {
                const tx = await stakingContract.connect(alice).stake(tokenFormat(2000));
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // check state
            {
                const stake = await stakingContract.balanceOf(alice.address);
                expect(stake).to.be.equal(tokenFormat(3000));
                
                const rewards = await stakingContract.rewardsOf(alice.address);
                expect(rewards[0].balance).to.be.equal('1388888888888888888400');
                expect(rewards[1].balance).to.be.equal('6944444444444444442000');
                expect(rewards[2].balance).to.be.equal('6944443200');
            }
            
            // mine next block after some time
            timestamp += 3600;
            await network.provider.send('evm_setNextBlockTimestamp', [ timestamp ]);
            await network.provider.send('evm_mine');
            
            // check state
            {
                const rewards = await stakingContract.rewardsOf(alice.address);
                expect(rewards[0].balance).to.be.equal('2777777777777777776800');
                expect(rewards[1].balance).to.be.equal('13888888888888888884000');
                expect(rewards[2].balance).to.be.equal('13888886400');
            }
        });
        
        it('Should properly share rewards', async() => {
        
        
        });
    });
});
