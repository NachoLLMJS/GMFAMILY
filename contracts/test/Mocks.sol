// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20Mock {
    function transfer(address to, uint256 amount) external returns (bool);
}

contract MockIdentityRegistry {
    mapping(uint256 => address) public ownerOf;
    function setOwner(uint256 agentId, address owner) external { ownerOf[agentId] = owner; }
}

contract MockToken {
    string public name;
    string public symbol;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    constructor(string memory n, string memory s) { name = n; symbol = s; }
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockFeeToken {
    string public name;
    string public symbol;
    mapping(address => uint256) public balanceOf;
    constructor(string memory n, string memory s) { name = n; symbol = s; }
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount * 9 / 10;
        return true;
    }
}

contract MockWrappedNative is MockToken("Wrapped BNB", "WBNB") {
    function deposit() external payable { balanceOf[msg.sender] += msg.value; }
}

contract MockPancakeV3Router {
    struct ExactInputSingleParams {
        address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline;
        uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 amountOut) {
        require(p.deadline >= block.timestamp, "expired");
        require(MockToken(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn), "input");
        amountOut = p.amountOutMinimum;
        require(MockToken(p.tokenOut).transfer(p.recipient, amountOut), "output");
    }
}

contract MockSwapAdapter {
    uint256 public outputOverride;
    uint256 public lastAmountIn;
    uint256 public lastMinOut;
    address public lastRecipient;

    function setOutput(uint256 amount) external { outputOverride = amount; }
    function swap(address, address tokenOut, uint24, uint256 amountIn, uint256 minOut, uint256) external payable returns (uint256 amountOut) {
        lastAmountIn = amountIn;
        lastMinOut = minOut;
        lastRecipient = msg.sender;
        amountOut = outputOverride == 0 ? minOut : outputOverride;
        require(IERC20Mock(tokenOut).transfer(msg.sender, amountOut), "output");
    }
}
