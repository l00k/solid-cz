import { ApprovalEvent, SampleToken, TransferEvent } from '@/SampleToken';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract, ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import { before } from 'mocha';
import { assertErrorMessage, assertEvent, txExec } from '../helpers/utils';
import { TestContext } from './TestContext';


const zeroAddress = '0x0000000000000000000000000000000000000000';

type SendContext = {
    sender : SignerWithAddress;
    from : string;
    to : string;
    tokenId : BigNumber;
}

describe('Transfering and approving', async() => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    let bob : SignerWithAddress;
    let carol : SignerWithAddress;
    let dave : SignerWithAddress;
    [ owner, alice, bob, carol, dave ] = await ethers.getSigners();
    
    let testContext : TestContext;
    let nftToken : SampleToken;
    
    let holderContract : Contract = null;
    let nonHolderContract : Contract = null;
    
    const sendContext : SendContext = {
        sender: alice,
        tokenId: BigNumber.from(0),
        from: alice.address,
        to: null,
    };
    
    
    beforeEach(async() => {
        testContext = new TestContext();
        
        // create holders
        holderContract = await testContext.deployContract('HolderContract');
        nonHolderContract = await testContext.deployContract('NonHolderContract');
        
        await testContext.initAccounts();
        nftToken = await testContext.initNftTokenContract();
        
        // create tokens
        await testContext.createTokens(15);
    });
    
    
    enum SendMode
    {
        Basic,
        Safe,
    };
    
    function testSendFailure (
        error : string,
        modes : SendMode[] = [ SendMode.Basic, SendMode.Safe ]
    )
    {
        if (modes.includes(SendMode.Basic)) {
            it(`Should fail with ${error} error while sending using transferFrom`, async() => {
                const txPromise = nftToken
                    .connect(sendContext.sender)
                    .transferFrom(
                        sendContext.from,
                        sendContext.to,
                        sendContext.tokenId
                    );
                await assertErrorMessage(txPromise, error);
            });
        }
        
        if (modes.includes(SendMode.Safe)) {
            it(`Should fail with ${error} error while sending using safeTransferFrom`, async() => {
                const txPromise = nftToken
                    .connect(sendContext.sender)
                    ['safeTransferFrom(address,address,uint256)'](
                        sendContext.from,
                        sendContext.to,
                        sendContext.tokenId
                    );
                await assertErrorMessage(txPromise, error);
            });
            
            it(`Should fail with ${error} error while sending using safeTransferFrom with bytes`, async() => {
                const txPromise = nftToken
                    .connect(sendContext.sender)
                    ['safeTransferFrom(address,address,uint256,bytes)'](
                        sendContext.from,
                        sendContext.to,
                        sendContext.tokenId,
                        []
                    );
                await assertErrorMessage(txPromise, error);
            });
        }
    }
    
    function testSendSuccessSingle (
        context : { txCallback: () => Promise<ContractTransaction> }
    )
    {
        it('Should emit Transfer event', async() => {
            const result = await (await context.txCallback()).wait();
            assertEvent<TransferEvent>(result, 'Transfer', {
                from: sendContext.from,
                to: sendContext.to,
                tokenId: sendContext.tokenId
            });
        });
        
        it('Should update ownership', async() => {
            const result = await (await context.txCallback()).wait();
            const owner = await nftToken.ownerOf(sendContext.tokenId);
            expect(owner).to.be.equal(sendContext.to);
        });
        
        it('Should update balances', async() => {
            const senderBalance = await nftToken.balanceOf(sendContext.from);
            const recipientBalance = await nftToken.balanceOf(sendContext.to);
            
            const result = await (await context.txCallback()).wait();
            
            {
                const currentBalance = await nftToken.balanceOf(sendContext.from);
                const delta = currentBalance.sub(senderBalance);
                expect(delta).to.be.equal(-1);
            }
            {
                const currentBalance = await nftToken.balanceOf(sendContext.to);
                const delta = currentBalance.sub(recipientBalance);
                expect(delta).to.be.equal(1);
            }
        });
        
        it('Should clear allowance', async() => {
            const result = await (await context.txCallback()).wait();
            const owner = await nftToken.getApproved(sendContext.tokenId);
            expect(owner).to.be.equal(zeroAddress);
        });
    }
    
    function testSendSuccess (
        modes : SendMode[] = [ SendMode.Basic, SendMode.Safe ]
    )
    {
        if (modes.includes(SendMode.Basic)) {
            describe('Sending using transferFrom', async() => {
                let context : { txCallback: () => Promise<ContractTransaction> } = {
                    txCallback: null,
                };
                
                beforeEach(async() => {
                    context.txCallback = () => nftToken
                        .connect(sendContext.sender)
                        .transferFrom(
                            sendContext.from,
                            sendContext.to,
                            sendContext.tokenId
                        );
                });
                
                testSendSuccessSingle(context);
            });
        }
        
        if (modes.includes(SendMode.Safe)) {
            describe('Sending using safeTransferFrom', async() => {
                let context : { txCallback: () => Promise<ContractTransaction> } = {
                    txCallback: null,
                };
                
                beforeEach(async() => {
                    context.txCallback = () => nftToken
                        .connect(sendContext.sender)
                        ['safeTransferFrom(address,address,uint256)'](
                            sendContext.from,
                            sendContext.to,
                            sendContext.tokenId
                        );
                });
                
                testSendSuccessSingle(context);
            });
            
            describe('Sending using safeTransferFrom with bytes', async() => {
                let context : { txCallback: () => Promise<ContractTransaction> } = {
                    txCallback: null,
                };
                
                beforeEach(async() => {
                    context.txCallback = () => nftToken
                        .connect(sendContext.sender)
                        ['safeTransferFrom(address,address,uint256,bytes)'](
                            sendContext.from,
                            sendContext.to,
                            sendContext.tokenId,
                            []
                        );
                });
                
                testSendSuccessSingle(context);
            });
        }
    }
    
    
    describe('Common validation', async() => {
        it('Properly verifies "from" param', async() => {
            const txPromise = nftToken
                .connect(owner)
                .transferFrom(alice.address, bob.address, BigNumber.from(0));
            await assertErrorMessage(txPromise, 'FromIsNotTokenOwner()');
        });
    });
    
    
    describe('Non existing token', async() => {
        before(() => {
            sendContext.tokenId = BigNumber.from(100);
        });
        
        describe('Sending to zero address', async() => {
            before(() => {
                sendContext.to = zeroAddress;
            });
            
            testSendFailure('TokenNotExist()');
        });

        describe('Sending to normal account', async() => {
            before(() => {
                sendContext.to = bob.address;
            });
            
            testSendFailure('TokenNotExist()');
        });
        
        describe('Sending to holder contract', async() => {
            before(() => {
                sendContext.to = holderContract.address;
            });
            
            testSendFailure('TokenNotExist()');
        });

        describe('Sending to non holder contract', async() => {
            before(() => {
                sendContext.to = nonHolderContract.address;
            });
            
            testSendFailure('TokenNotExist()');
        });
        
        it('Fails to approve with TokenNotExist()', async() => {
            const txPromise = nftToken
                .connect(sendContext.sender)
                .approve(
                    bob.address,
                    sendContext.tokenId
                );
                
            await assertErrorMessage(txPromise, 'TokenNotExist()');
        });
    });
    
    
    describe('Non owned token', async() => {
        before(() => {
            sendContext.tokenId = BigNumber.from(0);
        });

        describe('Sending to zero address', async() => {
            before(() => {
                sendContext.to = zeroAddress;
            });
            
            testSendFailure('NotAllowed()');
        });

        describe('Sending to normal account', async() => {
            before(() => {
                sendContext.to = bob.address;
            });
            
            testSendFailure('NotAllowed()');
        });

        describe('Sending to holder contract', async() => {
            before(() => {
                sendContext.to = holderContract.address;
            });

            testSendFailure('NotAllowed()');
        });

        describe('Sending to non holder contract', async() => {
            before(() => {
                sendContext.to = nonHolderContract.address;
            });

            testSendFailure('NotAllowed()');
        });
        
        it('Fails to approve with NotAllowed()', async() => {
            const txPromise = nftToken
                .connect(sendContext.sender)
                .approve(
                    bob.address,
                    sendContext.tokenId
                );
                
            await assertErrorMessage(txPromise, 'NotAllowed()');
        });
    });


    describe('Owned token', async() => {
        beforeEach(async () => {
            await testContext.sendTokens(3);
            sendContext.tokenId = testContext.accountsState.alice.nfts[0];
        });

        describe('Sending to zero address', async() => {
            before(() => {
                sendContext.to = zeroAddress;
            });
            
            testSendFailure('ZeroAddressNotAllowed()');
        });

        describe('Sending to normal account', async() => {
            before(() => {
                sendContext.to = bob.address;
            });
            
            testSendSuccess();
        });

        describe('Sending to holder contract', async() => {
            before(() => {
                sendContext.to = holderContract.address;
            });

            testSendSuccess();
        });

        describe('Sending to non holder contract', async() => {
            before(() => {
                sendContext.to = nonHolderContract.address;
            });

            testSendFailure('RecipientNotAccepted()', [ SendMode.Safe ]);
            testSendSuccess([ SendMode.Basic ]);
        });
        
        describe('Approving', async() => {
            before(() => {
                sendContext.to = bob.address;
            });
            
            it('Should emit Approval()', async() => {
                const [tx, result] = await txExec(
                    nftToken
                        .connect(sendContext.sender)
                        .approve(
                            sendContext.to,
                            sendContext.tokenId
                        )
                );
                
                assertEvent<ApprovalEvent>(result, 'Approval', {
                    owner: sendContext.from,
                    approved: sendContext.to,
                    tokenId: sendContext.tokenId,
                })
            });
            
            it('Should change state', async() => {
                const [tx, result] = await txExec(
                    nftToken
                        .connect(sendContext.sender)
                        .approve(
                            sendContext.to,
                            sendContext.tokenId
                        )
                );
                
                const approved = await nftToken.getApproved(sendContext.tokenId);
                expect(approved).to.be.equal(sendContext.to);
            });
        });
    });


    describe('Approved token', async() => {
        beforeEach(async () => {
            await testContext.sendTokens(3);
            await txExec(
                nftToken
                    .connect(carol)
                    .approve(alice.address, testContext.accountsState.carol.nfts[0])
            );
            
            sendContext.from = carol.address;
            sendContext.tokenId = testContext.accountsState.carol.nfts[0];
        });

        describe('Sending to zero address', async() => {
            before(() => {
                sendContext.to = zeroAddress;
            });
            
            testSendFailure('ZeroAddressNotAllowed()');
        });

        describe('Sending to normal account', async() => {
            before(() => {
                sendContext.to = bob.address;
            });
            
            testSendSuccess();
        });

        describe('Sending to holder contract', async() => {
            before(() => {
                sendContext.to = holderContract.address;
            });

            testSendSuccess();
        });

        describe('Sending to non holder contract', async() => {
            before(() => {
                sendContext.to = nonHolderContract.address;
            });

            testSendFailure('RecipientNotAccepted()', [ SendMode.Safe ]);
            testSendSuccess([ SendMode.Basic ]);
        });
        
        describe('Approving to someone else', async() => {
            before(() => {
                sendContext.to = dave.address;
            });
            
            it('Should emit Approval()', async() => {
                const [tx, result] = await txExec(
                    nftToken
                        .connect(sendContext.sender)
                        .approve(
                            sendContext.to,
                            sendContext.tokenId
                        )
                );
                
                assertEvent<ApprovalEvent>(result, 'Approval', {
                    owner: sendContext.from,
                    approved: sendContext.to,
                    tokenId: sendContext.tokenId,
                })
            });
            
            it('Should change state', async() => {
                const [tx, result] = await txExec(
                    nftToken
                        .connect(sendContext.sender)
                        .approve(
                            sendContext.to,
                            sendContext.tokenId
                        )
                );
                
                const approved = await nftToken.getApproved(sendContext.tokenId);
                expect(approved).to.be.equal(sendContext.to);
            });
        });
    });


    describe('Approving for all', async() => {
    
    });


    describe('Approved all tokens', async() => {
        beforeEach(async () => {
            await testContext.sendTokens(3);
            await txExec(
                nftToken
                    .connect(carol)
                    .setApprovalForAll(alice.address, true)
            );
            
            sendContext.from = carol.address;
            sendContext.tokenId = testContext.accountsState.carol.nfts[1];
        });

        describe('Sending to zero address', async() => {
            before(() => {
                sendContext.to = zeroAddress;
            });
            
            testSendFailure('ZeroAddressNotAllowed()');
        });

        describe('Sending to normal account', async() => {
            before(() => {
                sendContext.to = bob.address;
            });
            
            testSendSuccess();
        });

        describe('Sending to holder contract', async() => {
            before(() => {
                sendContext.to = holderContract.address;
            });

            testSendSuccess();
        });

        describe('Sending to non holder contract', async() => {
            before(() => {
                sendContext.to = nonHolderContract.address;
            });

            testSendFailure('RecipientNotAccepted()', [ SendMode.Safe ]);
            testSendSuccess([ SendMode.Basic ]);
        });
    });
    
    
});
